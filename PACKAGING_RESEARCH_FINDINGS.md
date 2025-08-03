# Research Findings for Issue #94: Package for Windows, macOS

*Research completed: August 2025*

After comprehensive research, here are the findings for packaging the ALP Experimental telescope application as native desktop installers without Docker dependency.

## 🔍 **Current State Analysis**

**Good News**: There's already substantial groundwork laid:
- **Existing Electron wrapper** at `/electron/` with working configuration
- **Comprehensive packaging plan** in `ELECTRON-PACKAGING-PLAN.md`
- **Docker configurations** for containerized deployment
- **Build scripts** (`build.sh`, `build.bat`) for development
- **Python FastAPI backend** with 45 dependencies including heavy ML libraries (PyTorch, OpenCV, SciKit-Image)
- **Next.js frontend** with 50+ dependencies including complex UI libraries

## 📊 **Packaging Options Comparison**

### **Backend (Python/FastAPI) Packaging**

| Tool | Performance | Bundle Size | Compatibility | Ease of Use | Cost | Notes |
|------|-------------|-------------|---------------|-------------|------|-------|
| **PyInstaller** ⭐ | Good startup | ~150-200MB | Excellent | Easy | Free | Already referenced in existing config |
| **Nuitka** | Fastest runtime | ~200-250MB | Good | Moderate | Free | Compiles to native code |
| **cx_Freeze** | Fast startup | ~140-180MB | Good | Moderate | Free | Faster load times than PyInstaller |

**Recommendation**: **PyInstaller** 
- Already referenced in existing Electron config
- Mature ecosystem with excellent FastAPI support
- Best compatibility with heavy dependencies (PyTorch, OpenCV, ONNX Runtime)
- Extensive community support and documentation

### **Frontend (Next.js) Integration**

| Approach | Bundle Size | Complexity | Performance | Maintenance | Notes |
|----------|-------------|------------|-------------|-------------|-------|
| **Electron + Next.js Static Export** ⭐ | ~70MB | Low | Good | Easy | Simpler deployment |
| **Electron + Next.js Standalone** | ~90MB | Medium | Excellent | Medium | Better for SSR features |
| **Tauri + Next.js** | ~15MB | High | Excellent | Hard | Requires Rust backend rewrite |

**Recommendation**: **Electron with Next.js Static Export**
- Simpler deployment model
- Lower complexity for maintenance
- Already configured in existing setup
- Compatible with current architecture

### **Alternative Frontend Packaging Tools**

| Tool | Pros | Cons | Best For |
|------|------|------|----------|
| **Electron** | Mature, large ecosystem, easy setup | Large bundle size, memory usage | Current project (already integrated) |
| **Tauri** | Small size (~15MB), better performance | Requires Rust rewrite, newer ecosystem | Greenfield projects |
| **Neutralino** | Very small (~10MB), web tech | Limited native API access | Simple web apps |

## 💰 **Code Signing Requirements & Costs (2024)**

### **Windows Requirements**
- **Certificate Type**: EV (Extended Validation) Code Signing Certificate (mandatory since June 2023)
- **Cost**: $249-$340/year from providers like SSL.com, Sectigo, DigiCert
- **Storage Requirement**: Must use FIPS 140 Level 2 hardware token or cloud-based signing
- **Benefits**: 
  - Immediate SmartScreen reputation (no security warnings)
  - Required for Windows driver signing
  - Establishes trust with Windows Defender

### **macOS Requirements**
- **Program**: Apple Developer Program membership 
- **Cost**: $99/year (includes unlimited certificates and notarization)
- **Process**: Code signing + notarization (both required for distribution)
- **Benefits**: 
  - Passes Gatekeeper security checks
  - No security warnings for users
  - App Store distribution capability (if desired)

### **Linux**
- **Requirements**: No mandatory code signing
- **Options**: Self-signed certificates acceptable
- **Distribution**: AppImage, Snap, Flatpak packaging

**Total Annual Investment**: ~$350-$440 for Windows + macOS code signing

## 🏗️ **Recommended Architecture**

Based on existing foundation and research:

```
┌─────────────────────────────────────┐
│         Electron Main Process       │  ← Use existing structure
│  ┌─────────────────────────────┐   │
│  │    PyInstaller Backend      │   │  ← ~200MB bundle
│  │    (FastAPI + ML libs)      │   │  │  - PyTorch, OpenCV
│  │    + Static file serving    │   │  │  - ONNX Runtime
│  └─────────────────────────────┘   │  │  - Network simulation
│  ┌─────────────────────────────┐   │
│  │    Next.js Static Export    │   │  ← ~20MB bundle
│  │    (Pre-built web assets)   │   │  │  - Radix UI components
│  └─────────────────────────────┘   │  │  - Enhanced image components
└─────────────────────────────────────┘
```

**Estimated Package Sizes**:
- **Compressed Installer**: ~220MB
- **Installed Size**: ~400-500MB
- **Memory Usage**: ~200-300MB at runtime

**Target Platform Support**:
- Windows 10/11 (x64)
- macOS 12+ (Intel & Apple Silicon)
- Linux (AppImage for universal compatibility)

## ⚠️ **Key Challenges Identified**

### **Technical Challenges**
1. **Heavy Dependencies**: 
   - PyTorch (~2GB uncompressed)
   - OpenCV with native binaries
   - ONNX Runtime for AI models
   - SciKit-Image, NumPy scientific libraries

2. **Complex FastAPI Application**:
   - 45 Python dependencies with native binaries
   - WebRTC components requiring system libraries
   - Network simulation middleware
   - Async/await patterns throughout

3. **Cross-Platform Compilation**:
   - No cross-compilation support (must build on target OS)
   - Platform-specific native dependencies
   - Different Python wheel architectures

4. **Runtime Dependencies**:
   - System webview requirements (for potential Tauri migration)
   - Hardware acceleration for image processing
   - Network interface access for telescope discovery

### **Business Challenges**
1. **Code Signing Costs**: ~$350/year ongoing expense
2. **Build Infrastructure**: Need Windows, macOS, Linux CI runners
3. **Support Complexity**: Multiple OS-specific installation issues
4. **Update Distribution**: Large delta updates due to ML libraries

## ✅ **Existing Assets (Ready to Leverage)**

### **1. Electron Foundation**
- Working Electron configuration in `/electron/`
- Process management for Python backend
- Window state management and system integration
- Auto-updater infrastructure setup

### **2. Build Infrastructure**
- Package.json scripts for electron builds
- Electron-builder configuration for multi-platform
- PyInstaller reference implementation
- Development vs production environment handling

### **3. Comprehensive Documentation**
- 6-week implementation roadmap in `ELECTRON-PACKAGING-PLAN.md`
- Detailed architecture diagrams
- Platform-specific build instructions
- Troubleshooting guides

### **4. Application Features**
- Network simulation middleware (perfect for testing packaging)
- Enhanced image components with lazy loading
- Comprehensive Python backend with ML capabilities
- Full Next.js frontend with modern UI components

## 🚀 **Recommended Implementation Strategy**

### **Phase 1: Foundation (Week 1)**
1. **Leverage existing Electron structure** - Don't reinvent the wheel
2. **Optimize PyInstaller configuration** for heavy ML dependencies
3. **Test packaging with network simulation** - Use new middleware for testing
4. **Validate bundle sizes** on each platform

### **Phase 2: CI/CD Pipeline (Week 2)**
1. **GitHub Actions setup** for multi-platform builds
2. **Automated testing** on clean VMs
3. **Artifact management** and distribution
4. **Build optimization** and caching strategies

### **Phase 3: Code Signing (Week 3)**
1. **Acquire certificates** (Windows EV + Apple Developer)
2. **Implement signing pipeline** in CI/CD
3. **Test signed installers** on target platforms
4. **Notarization setup** for macOS

### **Phase 4: Polish & Testing (Week 4)**
1. **First-run experience** optimization
2. **Error handling** and crash reporting
3. **Performance profiling** and optimization
4. **User acceptance testing** on real systems

## 💡 **Alternative Approaches Considered**

### **1. Docker Desktop Integration**
- **Pros**: Leverage existing Docker configs, easier deployment
- **Cons**: Requires Docker Desktop installation, ~500MB overhead
- **Verdict**: Less user-friendly for non-technical users

### **2. Progressive Web App (PWA)**
- **Pros**: Zero installation, automatic updates, cross-platform
- **Cons**: Limited hardware access, no system integration
- **Verdict**: Not suitable for telescope hardware control

### **3. Cloud-Hosted with Thin Client**
- **Pros**: No local installation complexity, centralized updates
- **Cons**: Requires internet, latency issues, ongoing hosting costs
- **Verdict**: Not suitable for field astronomy use

### **4. Tauri Migration**
- **Pros**: Much smaller bundles (~15MB), better performance
- **Cons**: Requires complete backend rewrite in Rust
- **Verdict**: Too large a scope change for current timeline

## 📈 **Success Metrics & Targets**

### **Performance Targets**
- **Startup Time**: < 10 seconds (cold start)
- **Memory Usage**: < 400MB baseline
- **Bundle Size**: < 250MB compressed installer
- **Install Time**: < 2 minutes on average hardware

### **Quality Targets**
- **Install Success Rate**: > 95% across platforms
- **Crash Rate**: < 0.1% (one crash per 1000 sessions)
- **Update Success Rate**: > 90%
- **User Satisfaction**: > 4.0/5.0 in feedback

### **Platform Coverage**
- **Windows**: 10/11 x64 (primary target)
- **macOS**: 12+ Intel & Apple Silicon
- **Linux**: Ubuntu 20.04+ (AppImage)

## 🔧 **Implementation Dependencies**

### **Required Investments**
1. **Code Signing Certificates**: $350/year
2. **CI/CD Infrastructure**: GitHub Actions (included in plan)
3. **Testing Hardware**: VMs for each target platform
4. **Developer Time**: ~4 weeks for full implementation

### **Technical Prerequisites**
1. **Windows**: Visual Studio Build Tools, Windows SDK
2. **macOS**: Xcode Command Line Tools, Apple Developer account
3. **Linux**: Build-essential, development libraries
4. **All Platforms**: Node.js 18+, Python 3.12+

## 📋 **Next Steps & Recommendations**

### **Immediate Actions (This Week)**
1. ✅ **Research completed** - This document
2. ⏳ **Design build pipeline** architecture
3. ⏳ **Create proof-of-concept** PyInstaller build
4. ⏳ **Test existing Electron setup** with current codebase

### **Short Term (Next 2 Weeks)**
1. **Optimize PyInstaller** for ML dependencies
2. **Set up GitHub Actions** for multi-platform builds
3. **Create signed build** proof-of-concept
4. **Test installation** on clean systems

### **Medium Term (Next 4 Weeks)**
1. **Complete packaging pipeline**
2. **Implement auto-update system**
3. **Comprehensive testing** across platforms
4. **Documentation and user guides**

## 🎯 **Final Recommendation**

**Proceed with Electron + PyInstaller approach** based on:

1. **Strong Foundation**: Existing Electron setup reduces risk
2. **Proven Technology**: PyInstaller handles complex Python dependencies well
3. **Reasonable Investment**: ~$350/year + 4 weeks development time
4. **Market Fit**: Desktop app aligns with telescope user expectations
5. **Maintainable**: Leverages existing team skills and infrastructure

The research confirms this is not only feasible but has a high probability of success given the existing groundwork. The main investment areas are code signing infrastructure and thorough testing across platforms.

**Risk Level**: Medium (due to complex dependencies)
**Success Probability**: High (due to existing foundation)
**Time to Market**: 4-6 weeks for MVP
**Annual Maintenance**: Low (primarily certificate renewals)

---

*This research provides the foundation for implementing Issue #94. The next step is designing the specific build pipeline architecture and beginning proof-of-concept development.*