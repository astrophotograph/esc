# ALP Experimental Release Notes

## Alpha Release - Version 25.07.28-alpha

**⚠️ ALPHA SOFTWARE:** This is experimental software under active development. Features may be incomplete, unstable, or subject to changes.

### 🚀 Major Features

- **Multi-Telescope Support** - Connect and control multiple Seestar telescopes simultaneously  
- **Live Camera View** - Real-time streaming with zoom, pan, and fullscreen capabilities
- **Picture-in-Picture Mode** - Monitor multiple views with floating windows  
- **Telescope Control Panel** - Comprehensive control interface for telescope operations
- **Location Management** - GPS and manual location setting for accurate observations
- **Image Processing Tools** - Advanced enhancement, denoising, and analysis capabilities
- **Message Center** - View and analyze telescope communication logs
- **Scenery Mode** - Simplified interface for landscape astrophotography
- **Help Documentation** - Built-in help system and interactive tour
- **System Administration** - Debug tools and version management

### 📋 Feature Details

#### Multi-Telescope Support
The application provides seamless management of multiple Seestar telescopes through an intelligent connection system. Users can easily switch between telescopes using the telescope selector in the header, with each telescope's connection status clearly displayed. The system automatically discovers telescopes on the network and maintains persistent connections. Each telescope's state is tracked independently, allowing for monitoring of multiple devices simultaneously.

#### Live Camera View  
The main camera view provides a responsive streaming interface with professional controls. Users can zoom in/out using mouse wheel or pinch gestures, pan around the image by dragging, and enter fullscreen mode for immersive viewing. The view supports multiple stream formats including MJPEG and RTSP, with automatic format detection and switching. Frame rate and resolution information are displayed in real-time.

#### Picture-in-Picture Mode
The PiP feature enables monitoring of multiple views simultaneously through floating windows. These windows can be freely positioned and resized, with positions persisting across sessions. Users can toggle PiP mode via the header button or keyboard shortcut (Ctrl+I). The overlay includes full camera controls and maintains independent zoom/pan states from the main view.

#### Telescope Control Panel
The control panel provides comprehensive telescope management through organized tabs. When not imaging, users have access to telescope controls for mount operations, focus adjustment, and system commands. During imaging sessions, quality metrics are displayed with real-time histogram analysis and star detection statistics. The panel also includes location settings with GPS integration and manual coordinate entry.

#### Location Management
Precise location setting is crucial for accurate telescope operations. The location panel supports both automatic GPS detection and manual entry of coordinates. Users can save frequently used locations and quickly switch between them. The system displays current coordinates, timezone information, and calculates local sidereal time for astronomical calculations.

#### Image Processing Tools
A dedicated processing page provides advanced image enhancement capabilities. Users can apply deconvolution for sharpening details, multiple denoising algorithms, histogram adjustments, and AI-based upscaling. The processing pipeline operates asynchronously, allowing users to continue using other features while images are being processed. Results can be compared side-by-side with originals.

#### Message Center
The message viewer provides deep insights into telescope communications. All commands and responses are logged with timestamps and can be filtered by type. JSON messages are displayed in an expandable tree format for easy navigation. The system supports searching through message history and exporting logs for debugging purposes.

#### Scenery Mode
This specialized mode optimizes the interface for terrestrial photography. When activated, it simplifies controls and adjusts image processing parameters for landscape shots. The mode can be toggled via the header button and automatically adjusts exposure settings for daylight conditions.

#### Help Documentation
Built-in documentation is accessible via the Help button (F1). The system includes an interactive tour for new users that highlights key interface elements. Context-sensitive help is available throughout the application, with detailed explanations of each feature. The documentation viewer supports searching and bookmarking.

#### System Administration
Advanced users can access system administration tools through the user menu. This includes version information display, debug logging controls, WebSocket connection monitoring, and system configuration options. The admin panel also provides access to error logs and performance metrics.

### 🎯 Previous Release Features

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

**Previous Release**: 20250720-172000 (Pre-Alpha)  
**Current Release**: 25.07.28-alpha

For technical support or feature requests, please visit our [GitHub repository](https://github.com/astrophotograph/alp-experimental).
