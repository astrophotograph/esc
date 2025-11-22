# Troubleshooting

Common issues and solutions to keep your observing session running smoothly.

## Connection Issues

### Telescope Not Found

**Symptoms**: No telescopes appear in discovery list

**Possible Causes & Solutions**:

1. **Network Issues**:
   - ✅ Verify telescope is powered on
   - ✅ Check WiFi connection on both devices
   - ✅ Ensure same network subnet
   - ✅ Try manual IP entry

2. **Firewall/Security**:
   - ✅ Disable firewall temporarily
   - ✅ Check antivirus settings
   - ✅ Allow port 4700 in firewall
   - ✅ Check VPN interference

3. **Telescope Configuration**:
   - ✅ Verify telescope WiFi mode
   - ✅ Check telescope IP address
   - ✅ Restart telescope
   - ✅ Factory reset if needed

### Connection Drops Frequently

**Symptoms**: Regular disconnections, timeouts

**Solutions**:

1. **Network Stability**:
   ```
   Check WiFi signal strength
   Move closer to router
   Switch to 5GHz band
   Reduce network congestion
   ```

2. **Power Management**:
   - Disable laptop sleep mode
   - Check telescope battery level
   - Use external power for telescope
   - Adjust power saving settings

3. **Browser Issues**:
   - Clear browser cache
   - Disable aggressive extensions
   - Try different browser
   - Update browser version

### Manual Connection Steps

When auto-discovery fails:

1. **Find Telescope IP**:
   ```bash
   # Check router admin page, or
   # Use network scanner
   nmap -sn 192.168.1.0/24
   ```

2. **Add Manually**:
   - Click "Manage Telescopes"
   - Select "Add Manually"
   - Enter IP: `192.168.1.XXX`
   - Port: `4700`
   - Test connection

## Video Feed Issues

### No Video Feed

**Symptoms**: Black screen, "No signal" message

**Troubleshooting Steps**:

1. **Check Connection**:
   - Verify telescope control works
   - Test movement commands
   - Check connection status

2. **Video Mode**:
   - Try switching to MJPEG mode
   - Check WebRTC compatibility
   - Disable browser extensions

3. **Browser Settings**:
   ```
   Chrome: chrome://settings/content/camera
   Firefox: about:preferences#privacy
   Safari: Preferences → Websites → Camera
   ```

### Poor Video Quality

**Symptoms**: Pixelated, low resolution, artifacts

**Solutions**:

1. **Network Bandwidth**:
   - Close other streaming apps
   - Check internet speed
   - Reduce video quality setting
   - Switch to wired connection

2. **Camera Settings**:
   - Adjust exposure/gain
   - Check focus position
   - Clean optical surfaces
   - Verify camera temperature

### High Latency

**Symptoms**: Delayed response to commands

**Optimization**:

1. **Connection Type**:
   - Use WebRTC when possible
   - Direct connection preferred
   - Minimize network hops
   - Use 5GHz WiFi

2. **System Performance**:
   - Close unnecessary tabs
   - Free up system memory
   - Enable hardware acceleration
   - Update graphics drivers

## Movement Problems

### Telescope Won't Move

**Diagnosis Steps**:

1. **Check Status**:
   - Is telescope parked?
   - Are limits engaged?
   - Is tracking enabled?
   - Check error messages

2. **Manual Test**:
   ```
   Try directional pad
   Test different speeds
   Check focus movement
   Verify in control panel
   ```

3. **Reset Sequence**:
   - Park telescope
   - Wait 10 seconds
   - Unpark telescope
   - Test movement

### Erratic Movement

**Symptoms**: Jerky motion, overshooting, incorrect direction

**Solutions**:

1. **Mechanical Issues**:
   - Check mount balance
   - Verify cable routing
   - Inspect for obstructions
   - Lubricate if needed

2. **Electronic Issues**:
   - Check power connections
   - Verify motor connections
   - Update firmware
   - Reset to defaults

### GoTo Accuracy Issues

**Symptoms**: Misses targets, points to wrong location

**Calibration Steps**:

1. **Alignment Check**:
   - Verify polar alignment
   - Check mechanical setup
   - Confirm location/time
   - Validate coordinates

2. **Re-calibration**:
   ```
   1. Choose bright star
   2. GoTo star
   3. Center manually
   4. Sync position
   5. Repeat with different star
   ```

## Performance Issues

### Slow Response

**Symptoms**: Delayed UI updates, sluggish controls

**Optimization**:

1. **Browser Performance**:
   - Close unused tabs
   - Clear cache and cookies
   - Restart browser
   - Update to latest version

2. **System Resources**:
   ```
   Check CPU usage
   Monitor memory usage
   Close background apps
   Restart computer if needed
   ```

3. **Network Performance**:
   - Test connection speed
   - Check ping times
   - Monitor packet loss
   - Use wired connection

### High CPU Usage

**Causes & Solutions**:

1. **Video Processing**:
   - Reduce video quality
   - Disable overlays
   - Close PIP windows
   - Limit frame rate

2. **Background Processes**:
   - Disable browser extensions
   - Close other applications
   - Check for malware
   - Update system drivers

## Browser-Specific Issues

### Chrome

**Common Problems**:
- WebRTC issues: Enable in `chrome://flags`
- CORS errors: Disable strict security temporarily
- Memory leaks: Restart browser regularly

### Firefox

**Common Problems**:
- WebRTC disabled: Enable in `about:config`
- Tracking protection: Add site to exceptions
- Hardware acceleration: Enable in preferences

### Safari

**Common Problems**:
- WebRTC limited: May need to use MJPEG
- Autoplay blocked: Allow for the site
- Cross-origin issues: Check security settings

## Error Messages

### "WebSocket Connection Failed"

**Causes**:
- Telescope powered off
- Network interruption
- Firewall blocking
- Server restart

**Solutions**:
1. Check telescope power and network
2. Click "Reconnect" button
3. Refresh browser page
4. Check firewall settings

### "Camera Access Denied"

**Causes**:
- Browser permissions
- Security settings
- Extension interference

**Solutions**:
1. Grant camera permissions
2. Check site settings
3. Disable conflicting extensions
4. Try incognito mode

### "GoTo Command Failed"

**Causes**:
- Invalid coordinates
- Hardware limits
- Safety restrictions
- Communication error

**Solutions**:
1. Verify coordinate format
2. Check telescope limits
3. Ensure telescope unparked
4. Retry command

## Data Issues

### Sessions Not Saving

**Symptoms**: Lost observation data, missing logs

**Prevention**:
1. Enable auto-save
2. Export data regularly
3. Check browser storage
4. Clear old data periodically

**Recovery**:
1. Check browser local storage
2. Look for auto-backup files
3. Import from export files
4. Recreate from memory

### Equipment Data Lost

**Recovery Steps**:
1. Check for export files
2. Re-import equipment
3. Recreate equipment sets
4. Update maintenance records

## Advanced Diagnostics

### Browser Developer Tools

**Enable Debugging**:
1. Press `F12`
2. Go to Console tab
3. Look for error messages
4. Check Network tab for failed requests

**Common Error Patterns**:
```javascript
// Connection errors
WebSocket connection failed
CORS policy blocked request

// Camera errors
getUserMedia() not supported
MediaDeviceError: Permission denied

// Performance warnings
Memory usage high
Frame rate dropped
```

### Network Diagnostics

**Test Commands**:
```bash
# Test connectivity
ping 192.168.1.100

# Check port access
telnet 192.168.1.100 4700

# Network scan
nmap -p 4700 192.168.1.0/24
```

### Telescope Diagnostics

**Status Checks**:
- Current position (RA/Dec)
- Temperature readings
- Battery voltage
- Motor status
- Error flags

## Getting Help

### Before Contacting Support

1. **Document the Issue**:
   - Exact error messages
   - Steps to reproduce
   - Browser and OS version
   - Telescope model and firmware

2. **Try Basic Solutions**:
   - Restart browser
   - Power cycle telescope
   - Check network connection
   - Try different browser

3. **Collect Information**:
   ```
   Browser: Chrome 119.0.6045.105
   OS: Windows 11 22H2
   Telescope: Seestar S50 v1.2.3
   Error: "WebSocket connection failed"
   Time: 2024-03-15 22:30 UTC
   ```

### Log Collection

**Enable Debug Logging**:
1. Open developer tools (F12)
2. Go to Console tab
3. Right-click and "Save as..."
4. Include with support request

### Community Resources

- **User Forums**: Share experiences
- **GitHub Issues**: Report bugs
- **Discord/Slack**: Real-time help
- **Documentation**: Check latest guides

---

Next: [FAQ](./faq.md) →