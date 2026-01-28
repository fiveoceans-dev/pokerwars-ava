import { domToJpeg, domToPng } from 'modern-screenshot';

/**
 * Captures the current page as a JPEG image and triggers automatic download
 * @param quality - JPEG quality (0-1), default is 0.9
 * @returns Promise that resolves when capture is complete
 */
export const captureAndDownloadScreen = async (quality: number = 0.9): Promise<void> => {
  try {
    console.log('📸 Starting page screenshot capture...');
    
    // Use modern-screenshot which supports OKLCH colors natively
    const dataUrl = await domToJpeg(document.body, {
      quality,
      backgroundColor: '#1a202c', // Dark background color
      width: window.innerWidth,
      height: window.innerHeight,
    });
    
    console.log('✅ Screenshot captured successfully with OKLCH support');
    
    // Convert data URL to blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    // Create download link with timestamp filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `poker-screenshot-${timestamp}.jpg`;
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log(`✅ Screenshot saved as ${filename}`);
  } catch (error) {
    console.error('❌ Failed to capture screenshot:', error);
    throw error;
  }
};

/**
 * Captures a specific element as a JPEG image and triggers automatic download
 * @param element - The DOM element to capture
 * @param quality - JPEG quality (0-1), default is 0.9
 * @returns Promise that resolves when capture is complete
 */
export const captureElementAndDownload = async (
  element: HTMLElement, 
  quality: number = 0.9
): Promise<void> => {
  try {
    console.log('📸 Starting element screenshot capture...');
    
    // Use modern-screenshot which supports OKLCH colors natively
    const dataUrl = await domToJpeg(element, {
      quality,
      backgroundColor: '#1a202c', // Dark background color
    });
    
    console.log('✅ Element screenshot captured successfully with OKLCH support');
    
    // Convert data URL to blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `poker-element-${timestamp}.jpg`;
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    
    document.body.appendChild(link);
    link.click();
    
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log(`✅ Element screenshot saved as ${filename}`);
  } catch (error) {
    console.error('❌ Failed to capture element screenshot:', error);
    throw error;
  }
};