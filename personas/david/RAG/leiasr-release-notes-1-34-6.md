---
id: leiasr-release-notes-1-34-6
title: LeiaSR Release Notes 1.34.6
date: 2025-08-22
type: release_notes
personas: [david]
summary: Comprehensive release notes for LeiaSR versions 1.21.1 through 1.34.6, detailing new features, bug fixes, and known issues across multiple updates.
---

**Key Terms**: LeiaSR, Weaving, Windowed Weaving, Late Latching, SR::Display, DirectX, OpenGL, AES-NI, Firmware Protocol (FPC), Display Data Channel/Command Interface (DDC/CI), Anti Cross-Talk (ACT), sRGB, Extended Display Identification Data (EDID), Eye Tracker, Face Tracking, SR Service, SR Session, Weaver, SDK, API.
**Also Known As**: Simulated Reality, SR Platform.

## Overview
This document contains the release notes for LeiaSR version 1.34.6, dated August 22, 2025, as well as the history of previous releases. The latest version introduces support for dual 2D/3D multi-monitor setups, dynamic windowed weaving for applications, and significant improvements to platform shutdown speed. The SDK examples have also been consolidated and updated to demonstrate new functionalities across various graphics APIs.

## Release History

### Version 1.34.6 (2025-08-22)

#### Features
- **Support for dual 2D/3D multi-monitor setups**: SR applications sharing a window across a 2D and 3D monitor will render the respective parts of the window in 2D and 3D accordingly.
- **Dynamic Windowed Weaving**: SR applications in windowed mode can be dragged across the screen without losing the 3D effect, requiring the latest weaving API.
- **Improved platform shutdown speed**: The platform now shuts down significantly faster when an SR application is closed.
- **Consolidated SDK examples**: The SDK now includes a more concise set of five weaving examples for DirectX 9, 10, 11, 12, and OpenGL. Each example demonstrates the same functionality, including the new weaver interface, fullscreen/windowed toggling (F11), display of 3D geometry or stereo images, sRGB support, and automatic launch on the LeiaSR display.

#### Bug Fixes
- **Content Truncation for deprecated weaving API**: Fixed a bug in backward compatibility logic that caused content to be truncated when using the deprecated non-predictive weaving API from version 1.34.5.

### Version 1.34.0 (2025-06-06)

#### Features
- **Windowed Weaving**: Applications can now run in resizable, draggable windows. Users can toggle between windowed and full-screen modes with F11.
- **Updated Weaving Interface**: Introduces pure virtual weaver classes for each graphics API, allowing for easier customization. Applications must now supply their own view textures.
- **Faster Tracker Start**: The tracking camera is no longer automatically disabled when a 3D application closes, allowing for a faster restart. This behavior can be customized in `ft_user.ini`.
- **Eyetracker Raw JPEG Shared Memory**: Enables applications to access the stereo camera feed from the tracker for video recording or 3D chat.
- **Removed Mono/Stereo tracking options from Dashboard**: OEMs can request a special runtime build for mono tracking performance evaluation.
- **Runtime Component Install Path**: All components and Platform Apps now install to `Program Files/LeiaSR` by default.

#### Bug Fixes
- **Tracking Camera Crash**: Fixed an issue where some tracking cameras would show a black image after power cycling the display multiple times. The solution ensures the camera is ready before it is enabled.

### Version 1.33.1 (2025-04-23)

#### Bug Fixes
- **Tracker Not Starting**: Addressed an issue where the tracker would not start on devices where AES-NI is supported by the hardware but not enabled. A runtime check now falls back to software-based encryption if AES-NI is not enabled.
- **Tracker Not Available Animation Freeze**: Fixed a shader logic bug that caused the "tracker not available" spinning light animation to freeze in some applications.

### Version 1.33.0 (2025-04-18)

#### Features
- **View Resolution Set/Get Method**: The optimal view resolution for weaving is now stored in `screen.ini` and can be managed via an API.
- **Enable/Disable Late Latching**: OEMs can now force Late Latching to be permanently on or off for each product code via `player.ini`.
- **Deprecate SR::Screen**: `SR::Screen` is deprecated in favor of `SR::Display`, which will be the only supported method going forward.
- **C API Wrapper for SR::Display**: Added C API calls to retrieve virtual display properties.
- **Weaver Protection Switched to AxProtector**: `DimencoWeaving.dll` protection was switched from Armadillo to AxProtector to resolve a crash with Unreal Engine games using the EOS SDK.
- **Weaver Returns Left View When Tracking Unavailable**: The weaver can be configured to show the left view (with or without an animation) when tracking is lost.
- **SDK Documentation Included**: The SDK documentation is now included in the SDK zip file.
- **Installer Filenames Changed**: Installers are now named `LeiaSR-SDK*` and `LeiaSR-Runtime*`.

#### Bug Fixes
- **Crash on Monitor Disconnect**: Fixed an invalid array access that occurred when a weaver was initiated while the monitor was disconnected.
- **DX9 Weaver Constructor**: Corrected wrong default parameters in the DX9 weaver constructor.

### Version 1.32.7 (2025-02-14)

#### Bug Fixes
- **Runtime Connection to FPC**: Re-enabled support for firmware protocol 2 after it was deprecated too early, causing connection issues.
- **OpenGL Application Crash with Late Latching**: Late latching is now automatically disabled on systems that do not support persistent buffers to prevent crashes in OpenGL applications.

### Version 1.32.6 (2025-02-12)

#### Features
- **Face Tracking Enhancements**: Introduced a customizable 3D view zone, a tracked user selection function, a grace period for detection, and improved "Face Overlap" issue handling, all configurable in `ft_user.ini`.
- **New 60fps Camera Type**: Added `SREyetrackerInputCamera`, a new camera type that provides 60 FPS output.
- **Improved Runtime Security**: Replaced 7zip with a version supporting high-entropy ASLR and compiled SRService with control flow guard enabled.
- **Installer Flag for Notifications**: Added a `/NONOTIFICATIONS` flag to the installer to disable SRService notifications.
- **Weaver Latency Defaults (Late Latching)**: Changed default latency to use 1 frame and enabled late latching by default. Capped latency at 150ms.
- **Visualization for Late Latching**: Added a dot visualization for late latching, configurable in `weaver.ini`.
- **Latency Estimate Optimization**: Improved the logic for `setLatencyInFrames` to provide a more accurate latency calculation.
- **Latency Query API**: Added `getLatency()` method to query the currently set latency in milliseconds.
- **Toggle for CrossTalk Correction (ACT)**: Added `setACTMode` and `getACTMode` to control Anti Cross-Talk correction (Off, Static, Dynamic).
- **Dynamic ACT Correction Factors**: Introduced `xfactor_dc` and `xfactor_a` parameters in `player.ini` to modulate static and dynamic components of ACT.
- **Flag for sRGB Textures**: Added a flag to specify if input textures are in Gamma colorspace, as the weaving and ACT functions operate optimally in Linear colorspace.
- **Support for Sunplus IR Camera**: Implemented an algorithm to cycle through different IR camera configurations to find a face.

#### Bug Fixes
- **Calibration Correction Image B Wrongly Applied**: Fixed an issue where a calibration correction image was applied at a factor of 4.
- **Calibration Correction Textures Y-Flipped in OpenGL**: Corrected an issue where calibration textures were applied with a y-flip in OpenGL.

#### Known Issues
- `srRedBlue.exe` verification app occasionally crashes with the new predictive weaver.

### Version 1.30.3 (2024-07-10)

#### Bug Fixes
- **SR Session Preventing Modern Standby**: Fixed an issue where laptops could not enter modern standby after using the Player by handling `SERVICE_CONTROL_POWEREVENT`.

### Version 1.30.2 (2024-04-26)

#### Features
- **Notification Language Support**: Added support for Thai and Ukrainian languages.
- **SR Platform Version API**: Added a new API endpoint to retrieve the installed SR platform version.

#### Bug Fixes
- **SR Session Startup Issue**: Fixed a bug where the 32-bit installer would remove the SR session from Windows startup.
- **Weaving Examples Stretching**: Corrected shader loading logic to prevent weaving examples from stretching when moved to another monitor with manual calibration files present.

### Version 1.30.0 (2024-02-23)

#### Features
- **32-bit Application Support**: Added 32-bit binaries and libraries to the platform and SDK.
- **Improved Eye-Tracking**: Implemented new filters to improve eye-tracking for both weaving and look-around.
- **Manual Calibration**: The platform now reads and uses manual calibration files in addition to factory calibration.

#### Bug Fixes
- **DirectX9 Exclusive Fullscreen**: Fixed an issue where 3D mode would not activate in DirectX9 exclusive fullscreen.
- **SR Service Stuck with Wide Characters**: Corrected an issue where SR Service would get stuck if an application name contained wide characters.
- **OpenGL Image Viewer Display**: Fixed a bug causing incorrect display of images with widths not divisible by four.

### Version 1.29.1 (2023-12-27)

#### Features
- **SR Licensing**: The platform now supports extracting and reading licenses from FPCs using protocol 4.
- **Face Lost/Found Events**: Added new system events for when the EyeTracker starts or stops tracking a user.
- **Face Lost Delay API**: Added a new function to set the face lost delay value.

### Version 1.28.1 (2023-11-24)

#### Features
- **SR Audio Support**: Added support for SR Audio, providing prediction-filtered head position, ear position, and head orientation data through the API.
- **DX9 and DX10 Weaver Support**: Added support for DirectX 9 and DirectX 10 weavers.

#### Bug Fixes
- **Predicting Weaver/Eyetrackers Settings**: Fixed an issue where predicting weavers and eyetrackers loaded default settings instead of product-specific ones.
- **OpenGL Weaving Example Black Screen**: Corrected window handle updates to fix a black screen issue on certain devices.
- **DirectX10 Image Viewer Crash**: Added exception handling for when a GPU cannot create a texture of the required size.

### Version 1.27.5 (2023-10-27)

#### Bug Fixes
- **FPC Disconnected Notification**: Suppressed the "FPC disconnected" notification after sleep/resume on certain laptop devices.

### Version 1.27.4 (2023-09-22)

#### Bug Fixes
- **VCP Setting Issues**: Fixed an issue where VCP settings could not be set after quickly detaching and reattaching the display cable.
- **Uninstaller Leaving Bin Folder**: Ensured the `bin` folder is removed during uninstallation.

### Version 1.27.1 (2023-07-27)

#### Bug Fixes
- **Stretched Application Content**: Fixed a logic error in DirectX11/12 weavers that caused application content to be stretched after detaching and reattaching the device.
- **Compiler Warnings with SR SDK**: Changed unnamed C++ structs into classes to resolve compiler warnings.
- **VCP Setting Not Changing**: Implemented a retry mechanism for setting VCP values.
- **Old Notifications Reappearing**: Corrected logic to prevent old notifications from reappearing after a service restart.
- **Weaving Example Sizing on Windows 10**: Added a check to resize the window correctly when moving examples between monitors.

### Version 1.26.2 (2023-06-07)

#### Bug Fixes
- **Multiple SR Dashboard Instances**: Ensured SR Dashboard is exited explicitly to prevent multiple instances from running.
- **Uninstaller Not Removing Manual Folders**: The uninstaller now removes the entire products folder.
- **DirectX12 Image Viewer 2D Mode**: Corrected window positioning logic to ensure the example starts in 3D mode.
- **C Application Crash on Context Destruction**: Fixed a pointer issue that caused a crash when destroying the SR context.
- **SR Service Crash**: Added a wait for initialization to prevent a crash when an application quickly creates and destroys the SR context.
- **USB Recognition Issues**: Improved handling of USB ports with multiple interfaces.

### Version 1.26.0 (2023-04-14)

#### Features
- **Option to Construct SR Context with Lens Off**: Added a constructor to the SR Context to control the initial lens state.
- **High Framerate Support**: Added a function to set latency compensation in frames rather than a fixed time.
- **Support for DirectX12 Typeless Textures**: Added weaver functions to support input buffers of typeless format.

#### Bug Fixes
- **Unsigned DLLs**: Digitally signed all DLLs to prevent antivirus warnings.
- **DirectX11 Sampler Warning**: Initialized the sampler to prevent a `DEVICE_DRAW_SAMPLER_NOT_SET` warning.

### Version 1.25.2 (2023-02-01)

#### Bug Fixes
- **Unsigned DLLs**: Digitally signed remaining unsigned DLLs.
- **USB Camera Device State**: Implemented consistent behavior for enabling and disabling the USB camera device.

### Version 1.25.1 (2022-12-30)

#### Features
- **Allow Invalid Buffers on DX12 Weaver Construction**: DirectX12 weavers can now be constructed with null framebuffers, to be set later.
- **Brazilian Portuguese Language Support**: Added notifications for Brazilian Portuguese.

#### Bug Fixes
- **DLL Not Found Error**: Ensured the environment PATH variable is passed to SR Dashboard to prevent "Unable to load DLL" errors.
- **Windows 11 Smart App Control Blocks Installation**: Digitally signed DLLs used during installation to prevent them from being blocked.
- **SR Service Not Added to Windows Services**: Added the missing Visual C++ Runtime 140_1 to the installer.

### Version 1.24.5 (2022-12-22)

#### Other Changes
- **Recognize New EDID**: The updated display component for several products is now correctly recognized.

### Version 1.24.4 (2022-11-11)

#### Features
- **DirectX12 Image Viewer Example**: Added an image viewer example for DirectX12.

#### Bug Fixes
- **Face Culling Causes Black Screen**: Set the weaver to the correct culling mode to prevent a black weaved image.
- **Resizing SR App Causes Ghosting**: Corrected resizing of internal buffers and DPI scaling.
- **OpenGL Example Issues**: Reworked OpenGL rendering to fix multiple issues, including black/red screens and minimization on focus loss.
- **Lens On with Conventional Monitor**: Fixed an issue where the lens would turn on when an SR app was launched on a non-SR monitor.

### Version 1.24.3 (2022-11-04)

#### Bug Fixes
- **Memory and CPU Usage Increase**: Updated the Leap Motion / Ultraleap SDK to version 5.7.2 to fix a memory leak.
- **Gesture Recognizer Crash**: Ensured model files are installed before prompting the user to restart to prevent crashes.

### Version 1.24.2 (2022-10-28)

#### Other Changes
- **Improved Battery Life**: Optimized settings to improve battery life when not using SR.
- **Allow Invalid Window Handle on Weaver Construction**: Weavers can now be constructed with an invalid window handle, to be set later.

#### Bug Fixes
- **Head Pose All Zero**: Provided an approximate head pose for devices with RealSense cameras.
- **Lens On When Switching Dashboard Tabs**: Fixed a timing issue that caused the lens to remain on.
- **Unwanted Logging in Unreal Editor**: Made SR application logging write to file only by default.

### Version 1.24.1 (2022-10-07)

#### Features
- **Head Pose API**: Introduced `HeadSense` and `HeadPoseSense` to get face position and orientation data.
- **Common Weaver Interface**: Provided a common interface for DirectX11, DirectX12, and OpenGL weavers.
- **Leap Motion / Ultraleap Gemini Support**: SR HandTracker now works with the latest "Gemini" SDK.

#### Bug Fixes
- **SR Dashboard Eye Tracker Tab Video**: Fixed an issue where an old video frame was shown.
- **Renderdoc Cannot Load for SR Applications**: Removed registry access from the weaver to allow Renderdoc to inject.
- **DirectX and OpenGL Examples Reconnection**: Implemented recommended logic to reconnect to SR Service.
- **Lens On at Windows Login Screen**: The lens is now disabled when the Windows screen is locked.
- **C# Example Crash**: Set x64 as the default compile architecture to prevent a crash on launch.

### Version 1.23.5 (2022-08-19)

#### Other Changes
- **Reduced Boot Time**: Removed an unnecessary startup link to reduce boot time by ~2 seconds.

#### Bug Fixes
- **EDID Not Detected**: Refactored code to correctly match different EDID values for DS1 devices.
- **SR Session Not Running**: Addressed multithreading problems and added a recovery mechanism.
- **Notification Shown Again on Startup**: Stored a timestamp with notification events to prevent them from re-showing.
- **Extra Items in Start Menu**: Changed the notification registration method to avoid adding items to the start menu.
- **SR Service Stops After Suspend/Resume**: Ensured the connection is reopened before verifying hardware authenticity.

### Version 1.23.3 (2022-07-29)

#### Bug Fixes
- **USB Devices Slow to Initialize**: Closed the USB hub connection immediately to prevent a 20-second delay on startup.
- **Windows Restart Notification**: Fixed an issue causing Windows to show a "restart required" message for USB devices.
- **DDC/CI Setting Not Changed**: Retrieved a new monitor identifier after a detach event to ensure DDC/CI settings are applied.
- **Unexpected Behavior on Quick Attach/Detach**: Added a reauthentication mechanism to handle rapid connection changes.

### Version 1.23.1 (2022-07-01)

#### Features
- **User Guidance Notifications**: Added notifications for cable status, incorrect resolution, and duplicated displays.
- **DDC/CI Support for Legacy SR Apps**: DDC/CI is now supported for all SR applications.

#### Bug Fixes
- **Workaround for Windows Serial Driver Bug**: Implemented multiple fixes to reduce the failure rate of USB connection detection after a detach event.
- **SR Eye Tracker Face Detection**: Corrected a calculation error that prevented the tracker from detecting faces at an angle.
- **Monitor Not Recognized**: Added new monitor identification information to the list of known SR devices.
- **DirectX12 Example Misaligned**: Resized the example window to the display size to fix alignment issues.

### Version 1.22.1 (2022-04-29)

#### Features
- **SR Eye Tracker for Face Masks**: Retrained the eye tracker algorithm to improve tracking for users wearing face masks.
- **C Functions for Lens State**: Added C functions to get the lens hint state.

#### Bug Fixes
- **Apple iTunes Conflict**: The SR Service now requests an available network port to avoid conflicts with iTunes.
- **Device Manager Flashing**: The lens control hardware is now only disabled when the system enters sleep or hibernate mode.
- **No Calibration Data on Early Devices**: The calibration data is now stored in a folder without special characters to support devices with empty serial numbers.

### Version 1.21.1 (2022-03-31)

#### Features
- **Attach and Detach Devices**: SR devices can now be attached and detached without a reinstall or reboot.
- **Monitor 3D Mode**: Selected SR monitors will automatically turn off color settings that interfere with SR mode.

#### Other Changes
- **Application Logging**: Logging is now automatically enabled for how SR applications use the SR Platform.

#### Bug Fixes
- Fixed issues with System Status tray application.
- Addressed a crash in Unreal applications when started from the editor or in debug mode.
