# Frequently Asked Questions

Quick answers to common questions about Experimental Scope Creep.

## General Questions

### What telescopes are supported?

**Currently Supported**:
- Seestar S50
- Seestar S30 (limited features)

**Planned Support**:
- Additional Seestar models
- Other smart telescopes (future)

The application uses the Seestar native protocol for optimal performance and feature access.

### Can I use this with my existing telescope setup?

Experimental Scope Creep is specifically designed for Seestar smart telescopes. For traditional telescopes:
- Consider ASCOM-compatible software
- Check for INDI drivers
- Look into SkySafari or Stellarium

### Is an internet connection required?

**Local Network Only**:
- No internet required for basic operation
- Telescope and computer on same WiFi sufficient
- All processing happens locally

**Optional Internet Features**:
- Weather forecasts
- Celestial event updates
- Cloud backup sync
- Remote access

## Installation and Setup

### How do I install the application?

**Web-based Application**:
- No installation required
- Access through web browser
- Works on Windows, Mac, Linux
- Mobile device compatible

**Deployment Options**:
- Hosted version (if available)
- Self-hosted (Docker)
- Development mode (Node.js)

### What browsers are supported?

**Recommended**:
- Chrome/Chromium (best WebRTC support)
- Microsoft Edge (Chromium-based)
- Firefox (good compatibility)
- Safari (limited WebRTC features)

**Minimum Versions**:
- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

### Do I need special network setup?

**Simple Setup** (Most Users):
- Connect telescope to home WiFi
- Connect computer to same network
- Application auto-discovers telescope

**Advanced Setup**:
- Static IP for telescope
- Port forwarding for remote access
- VPN for security
- QoS for video streams

## Operation Questions

### Why is my video feed laggy?

**Common Causes**:
1. **Network**: Weak WiFi signal, interference
2. **Browser**: Too many tabs, old version
3. **System**: Low memory, high CPU usage
4. **Settings**: High resolution, many overlays

**Quick Fixes**:
- Use 5GHz WiFi
- Close unnecessary browser tabs
- Switch to MJPEG mode
- Reduce video quality

### How accurate is the GoTo function?

**Typical Accuracy**:
- Within 0.5° for most targets
- Better with plate solving
- Depends on alignment quality

**Improving Accuracy**:
- Careful polar alignment
- Two-star calibration
- Regular sync corrections
- Temperature compensation

### Can I control multiple telescopes?

**Yes!** Multi-telescope support includes:
- Automatic discovery of all telescopes
- Quick switching between instruments
- Independent control of each
- Synchronized operations possible

### How do I backup my observation data?

**Automatic Backups**:
- Local storage every 5 minutes
- Session data preserved
- Equipment database saved

**Manual Export**:
- Settings → Data Management
- Export to CSV, JSON, PDF
- Include all or filtered data
- Regular exports recommended

## Technical Questions

### What data is stored locally vs cloud?

**Local Storage** (Browser):
- Observation logs
- Equipment database
- Session history
- User preferences
- Cached images

**Cloud Storage** (Optional):
- Backup copies only
- User must configure
- No automatic uploads
- Privacy maintained

### Can I use this on a tablet or phone?

**Mobile Support**:
- Responsive design
- Touch controls
- Essential features available
- Reduced bandwidth mode

**Best Experience**:
- Tablet preferred over phone
- Landscape orientation
- External keyboard helpful
- Good WiFi connection essential

### How much bandwidth does it use?

**Video Streaming**:
- WebRTC: 1-5 Mbps
- MJPEG: 2-8 Mbps
- Control commands: Minimal (<1 Kbps)

**Optimization**:
- Lower resolution reduces usage
- Disable overlays for less data
- MJPEG uses more than WebRTC

### Is my data private and secure?

**Privacy Features**:
- All processing is local
- No telemetry collection
- No user tracking
- Data stays on your devices

**Security Measures**:
- Encrypted connections (HTTPS/WSS)
- No passwords stored in plain text
- Session timeout protection
- Optional authentication

## Features and Functionality

### Can I add custom celestial objects?

**Current Version**:
- Built-in catalogs (Messier, NGC, IC)
- Cannot add custom objects yet

**Planned Features**:
- Custom object import
- User-defined catalogs
- Observation planning lists
- Community object sharing

### Does it support imaging sequences?

**Basic Imaging**:
- Live view with settings control
- Manual capture timing
- Single exposures

**Advanced Imaging** (Future):
- Automated sequences
- Filter wheel support
- Dithering patterns
- Live stacking

### Can I share observations with others?

**Current Sharing**:
- Export observation logs
- PDF reports
- CSV data files
- Screenshots

**Future Sharing**:
- Online galleries
- Social features
- Real-time observation sharing
- Community challenges

### What about planetarium software integration?

**Compatible With**:
- SkySafari (limited)
- Stellarium (basic)
- Custom applications via API

**Integration Methods**:
- Export target lists
- Import coordinates
- API endpoints
- Plugin system (planned)

## Troubleshooting

### The application won't load

**Check**:
1. Internet connection (for initial load)
2. Browser compatibility
3. JavaScript enabled
4. Ad blockers disabled
5. Browser cache cleared

### Telescope connects but controls don't work

**Verify**:
1. Telescope is unparked
2. No hardware errors on telescope
3. Firmware is up to date
4. No physical obstructions
5. Try browser refresh

### Settings keep resetting

**Possible Causes**:
- Browser private/incognito mode
- Aggressive privacy settings
- Low storage space
- Browser cache clearing

**Solutions**:
- Export settings as backup
- Check browser storage settings
- Free up disk space
- Use regular browsing mode

## Performance and Optimization

### How can I improve performance?

**Browser Optimization**:
- Enable hardware acceleration
- Close unused tabs
- Update to latest version
- Disable unnecessary extensions

**System Optimization**:
- Free up RAM (8GB+ recommended)
- Use SSD storage
- Update graphics drivers
- Close background applications

**Network Optimization**:
- Use 5GHz WiFi
- Position closer to router
- Reduce interference sources
- Consider wired connection

### Can I use this on older hardware?

**Minimum Requirements**:
- 4GB RAM (8GB recommended)
- Dual-core processor
- Integrated graphics acceptable
- 1280x720 screen resolution

**Optimization for Older Systems**:
- Reduce video quality
- Disable overlays
- Use MJPEG instead of WebRTC
- Close other applications

## Future Development

### What new features are planned?

**Near Term**:
- Enhanced imaging capabilities
- Custom object catalogs
- Mobile app
- API improvements

**Long Term**:
- Support for additional telescopes
- Advanced automation
- Community features
- Machine learning integration

### How can I contribute?

**Ways to Help**:
- Report bugs and issues
- Suggest new features
- Beta test new releases
- Share with astronomy community
- Contribute to documentation

**For Developers**:
- GitHub repository available
- Open source components
- API documentation
- Plugin development guides

### Is commercial use allowed?

**License Terms**:
- Check project license
- Personal use encouraged
- Commercial use restrictions may apply
- Contact developers for commercial licensing

---

**Still have questions?** Check the [Troubleshooting Guide](./troubleshooting.md) or visit our community forums.
