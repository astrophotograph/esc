# ALP Experimental Release Notes

## Pre-Alpha Release - Build 20250720-172000 (Estimated)

**⚠️ PRE-ALPHA SOFTWARE:** This is experimental software under active development. Features may be incomplete, unstable, or subject to significant changes.

### 🎯 New User-Visible Features

#### 🖼️ Advanced Image Enhancement
- **Deconvolution Controls**: New strength and PSF size adjustment sliders for advanced image sharpening and detail recovery
- **Enhanced AI Upscaling**: Comprehensive super-resolution capabilities with multiple algorithm options (EDSR, FSRCNN, ESRGAN)
- **Advanced Denoising**: Multiple denoising methods including TV Chambolle, bilateral, non-local means, and wavelet filtering
- **Streamlined Interface**: Cleaned up enhancement options to provide clearer, more focused controls

#### 📍 Object Annotations & Tracking
- **Improved Fullscreen Support**: Annotations now scale properly when switching to fullscreen mode
- **Enhanced Portrait Support**: Better annotation handling for different image orientations and aspect ratios
- **Live Stream Compatibility**: Improved annotation overlay support for MJPEG and other streaming formats

#### 🖥️ User Interface Improvements
- **Improved Product Tour**: Better overlay system with cleaner highlighting and smoother transitions
- **Picture-in-Picture**: Enhanced PiP windows with position persistence and advanced controls
- **Interactive Documentation**: Built-in documentation viewer with search functionality
- **Touch Interface**: Improved drag functionality for starmap and overlay windows

#### 📞 Enhanced Communication
- **Advanced Message System**: Comprehensive telescope message parsing with expandable JSON tree display
- **Real-time Updates**: Improved WebSocket communication for faster, more reliable telescope control
- **Toast Notifications**: Clear feedback for telescope commands and system status changes

#### 🎯 Telescope Control Features
- **Celestial Object Search**: Enhanced target selection with goto functionality and real-time notifications
- **Scenery Mode**: Simplified interface mode optimized for landscape astrophotography
- **Status Monitoring**: Visual threshold warnings and confirmation dialogs for important operations
- **RTSP Streaming**: Added support for RTSP camera streams with proper ID management

### 🔧 Stability & Quality Improvements

#### 🛡️ System Reliability
- **WebSocket Stability**: Significantly improved connection handling and automatic error recovery
- **Image Processing**: Resolved pipeline integration issues and enhanced streaming compatibility
- **API Communication**: Fixed CORS issues and standardized proxy configurations
- **Memory Management**: Better resource handling for large image processing tasks

#### 🧪 Code Quality & Testing
- **End-to-End Testing**: Comprehensive Playwright testing infrastructure for critical user workflows
- **Error Handling**: Enhanced error recovery and user feedback throughout the application
- **Type Safety**: Improved TypeScript integration and runtime type checking
- **Performance**: Optimized image processing with async thread-pool execution

#### 🔄 Architecture Improvements
- **Async Processing**: Made image enhancement pipeline fully thread-safe and non-blocking
- **Configuration Management**: Server-side settings storage with improved synchronization
- **Build System**: Automated Git-triggered builds with proper version tagging
- **Dependency Updates**: Latest stable versions of all major components (FastAPI, React, Python packages)

### 📋 Known Issues
- Some experimental features may have limited documentation
- Performance optimizations ongoing for very large image files
- Mobile interface optimizations in progress

---

**Previous Release**: 20250712-041002  
**Current Release**: Build 20250720-172000 (Estimated)

For technical support or feature requests, please visit our [GitHub repository](https://github.com/astrophotograph/alp-experimental).
