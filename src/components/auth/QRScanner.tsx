import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, CameraOff, AlertCircle, RefreshCw, Zap, Upload, Image as ImageIcon, ShieldCheck } from 'lucide-react';
import { normalizeScannedQr } from '../../lib/api';

interface QRScannerProps {
  onScan: (token: string) => void;
  isVerifying: boolean;
  onPermissionDenied?: (message: string) => void;
  onCameraUnavailable?: (message: string) => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({
  onScan,
  isVerifying,
  onPermissionDenied,
  onCameraUnavailable,
}) => {
  const scannerContainerId = 'qr-reader-viewport';
  const fileTempContainerId = 'qr-file-scanner-temp';
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [scannerState, setScannerState] = useState<'idle' | 'starting' | 'scanning' | 'error' | 'stopped'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFileScanning, setIsFileScanning] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const isScanningRef = useRef(false);
  const scanLockRef = useRef(false);

  // Sync isVerifying to scanLockRef
  useEffect(() => {
    scanLockRef.current = isVerifying;
  }, [isVerifying]);

  const handleValidQrToken = (rawText: string) => {
    if (scanLockRef.current) return;

    const normalized = normalizeScannedQr(rawText);
    const cleanToken = normalized || (rawText ? rawText.trim() : '');

    // Support all valid QR formats (including short CCS QR codes e.g. CRMC-2026-XXXX and 64-char tokens)
    if (cleanToken && cleanToken.length >= 3 && cleanToken.length <= 256) {
      scanLockRef.current = true;
      // Stop live camera scanner upon valid detection
      if (html5QrCodeRef.current && isScanningRef.current) {
        try {
          isScanningRef.current = false;
          html5QrCodeRef.current.stop().then(() => {
            setScannerState('stopped');
          }).catch(() => {
            // Ignore stop errors during transition
          });
        } catch {
          // Ignore
        }
      }
      onScan(cleanToken);
    }
  };

  const startScanner = async () => {
    try {
      setErrorMessage(null);
      setUploadError(null);
      setScannerState('starting');

      // If existing instance exists, clear it first
      if (html5QrCodeRef.current) {
        if (isScanningRef.current) {
          try {
            await html5QrCodeRef.current.stop();
          } catch {
            // Ignore stop errors on re-init
          }
        }
        try {
          html5QrCodeRef.current.clear();
        } catch {
          // Ignore clear errors
        }
        html5QrCodeRef.current = null;
      }

      const scanner = new Html5Qrcode(scannerContainerId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });

      html5QrCodeRef.current = scanner;

      const qrConfig = {
        fps: 15,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      };

      const qrCodeSuccessCallback = (decodedText: string) => {
        handleValidQrToken(decodedText);
      };

      // Attempt environment camera first, fallback to user/default
      try {
        await scanner.start(
          { facingMode: 'environment' },
          qrConfig,
          qrCodeSuccessCallback,
          () => {
            // Frame scan failure (normal while scanning empty space)
          }
        );
      } catch (envError: unknown) {
        const err = envError as { name?: string; message?: string };
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          throw envError;
        }
        // Fallback to any available video device
        await scanner.start(
          { facingMode: 'user' },
          qrConfig,
          qrCodeSuccessCallback,
          () => {}
        );
      }

      isScanningRef.current = true;
      setScannerState('scanning');
    } catch (err: unknown) {
      isScanningRef.current = false;
      setScannerState('error');

      const errorObj = err as { name?: string; message?: string };
      const errorName = errorObj.name || '';
      const rawMessage = errorObj.message || '';

      if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError' || rawMessage.includes('Permission')) {
        const msg = 'Camera access was denied. You can select an image of your QR code below or enter your code manually.';
        setErrorMessage(msg);
        onPermissionDenied?.(msg);
      } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError' || rawMessage.includes('NotFound')) {
        const msg = 'No camera found on this device. You can upload an image of your QR code below or use manual entry.';
        setErrorMessage(msg);
        onCameraUnavailable?.(msg);
      } else {
        const msg = 'Unable to start camera. You can upload an image of your QR code below or switch to manual entry.';
        setErrorMessage(msg);
        onCameraUnavailable?.(msg);
      }
    }
  };

  /**
   * Decodes QR code from an image file completely in client-side memory.
   * ZERO-STORAGE GUARANTEE: The file is NEVER sent across network or stored anywhere.
   */
  const processImageFile = async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setUploadError('Please select a valid image file (PNG, JPG, JPEG, WEBP).');
      return;
    }

    setIsFileScanning(true);
    setUploadError(null);

    let tempScanner: Html5Qrcode | null = null;
    try {
      // Create a temporary client-side decoder instance attached to the hidden memory container
      tempScanner = new Html5Qrcode(fileTempContainerId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });

      const decodedText = await tempScanner.scanFile(file, false);

      if (decodedText) {
        handleValidQrToken(decodedText);
      } else {
        setUploadError('No QR code detected in this image. Please try a clearer picture or scan using your camera.');
      }
    } catch {
      setUploadError('Could not detect a QR code in the selected image. Please make sure the QR code is clearly visible and well-lit.');
    } finally {
      if (tempScanner) {
        try {
          tempScanner.clear();
        } catch {
          // Ignore
        }
      }
      setIsFileScanning(false);
      // Reset input value to allow selecting the same file again if needed
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processImageFile(files[0]);
    }
  };

  const handleTriggerUpload = () => {
    fileInputRef.current?.click();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processImageFile(e.dataTransfer.files[0]);
    }
  };

  useEffect(() => {
    let isMounted = true;

    // Small delay to ensure DOM element is ready
    const timer = setTimeout(() => {
      if (isMounted) {
        startScanner();
      }
    }, 100);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (html5QrCodeRef.current && isScanningRef.current) {
        html5QrCodeRef.current
          .stop()
          .then(() => {
            try {
              html5QrCodeRef.current?.clear();
            } catch {
              // Ignore
            }
          })
          .catch(() => {
            // Ignore unmount stop errors
          });
      }
    };
  }, []);

  return (
    <div className="qr-scanner-wrapper">
      {/* Hidden container for client-side in-memory file decoding */}
      <div id={fileTempContainerId} style={{ display: 'none' }} aria-hidden="true" />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        aria-label="Upload QR Code Image"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      {/* Scanner Viewport */}
      <div
        className={`qr-scanner-viewport-container ${isDragOver ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div id={scannerContainerId} className="qr-reader-element" />

        {/* Viewfinder Overlay */}
        {scannerState === 'scanning' && !isVerifying && !isFileScanning && (
          <div className="qr-viewfinder-overlay">
            <div className="qr-viewfinder-box">
              <div className="qr-corner top-left" />
              <div className="qr-corner top-right" />
              <div className="qr-corner bottom-left" />
              <div className="qr-corner bottom-right" />
              <div className="qr-scan-laser" />
            </div>
            <div className="qr-scan-hint">
              <Zap size={14} className="text-accent" />
              <span>Align your Student or Employee QR code within the frame</span>
            </div>
          </div>
        )}

        {/* Starting / Loading Overlay */}
        {scannerState === 'starting' && !isFileScanning && (
          <div className="qr-state-overlay">
            <RefreshCw size={28} className="spin-animation text-accent" />
            <span>Initializing camera...</span>
          </div>
        )}

        {/* File Decoding Overlay */}
        {isFileScanning && (
          <div className="qr-state-overlay verifying">
            <RefreshCw size={32} className="spin-animation text-accent" />
            <span style={{ fontWeight: 600, fontSize: '1rem' }}>Reading QR from Image...</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Processing locally on your device</span>
          </div>
        )}

        {/* Verifying Overlay */}
        {isVerifying && !isFileScanning && (
          <div className="qr-state-overlay verifying">
            <RefreshCw size={32} className="spin-animation text-accent" />
            <span style={{ fontWeight: 600, fontSize: '1rem' }}>Verifying QR Code...</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Securing your session</span>
          </div>
        )}

        {/* Camera Error Overlay */}
        {scannerState === 'error' && !isFileScanning && (
          <div className="qr-state-overlay error" role="alert">
            <CameraOff size={36} color="var(--accent-danger)" aria-hidden="true" />
            <p className="qr-error-text">{errorMessage}</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={startScanner}
                className="btn btn-secondary qr-retry-btn"
                aria-label="Retry starting camera"
              >
                <Camera size={16} aria-hidden="true" />
                <span>Retry Camera</span>
              </button>
              <button
                type="button"
                onClick={handleTriggerUpload}
                className="btn btn-primary qr-upload-action-btn"
                aria-label="Upload QR Image"
              >
                <Upload size={16} aria-hidden="true" />
                <span>Upload QR Image</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Upload Error Message */}
      {uploadError && (
        <div className="qr-upload-error-banner" role="alert">
          <AlertCircle size={16} className="text-danger" aria-hidden="true" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* File Upload Option Bar */}
      <div className="qr-upload-section">
        <div className="qr-upload-divider">
          <span>OR</span>
        </div>
        <button
          type="button"
          onClick={handleTriggerUpload}
          disabled={isVerifying || isFileScanning}
          className="btn btn-secondary qr-upload-btn"
          aria-label="Select or upload QR code image from your device"
        >
          <ImageIcon size={16} aria-hidden="true" />
          <span>Select / Upload QR Code Image</span>
        </button>

        {/* Privacy & Zero-Storage Guarantee Badge */}
        <div className="qr-privacy-badge" role="note" aria-label="Privacy guarantee">
          <ShieldCheck size={14} className="text-success" aria-hidden="true" />
          <span>Images are processed locally on your device and never uploaded or stored.</span>
        </div>
      </div>

      {/* Safety Notice */}
      {scannerState === 'scanning' && !isVerifying && !isFileScanning && (
        <div className="qr-scanner-footer-notice" role="status">
          <AlertCircle size={14} aria-hidden="true" />
          <span>Point your camera or upload your official AttendEase Student or Employee QR code.</span>
        </div>
      )}
    </div>
  );
};

