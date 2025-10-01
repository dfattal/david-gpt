---
id: leiasr-release-notes-1-34-6
title: LeiaSR Release Notes 1.34.6 - 1.21.1
date: 2025-08-22
type: release_notes
personas: [david]
summary: Comprehensive release notes for LeiaSR versions 1.34.6 down to 1.21.1, detailing new features like Dynamic Windowed Weaving and dual monitor support, bug fixes, and known issues across various updates.
identifiers: ["1.34.6", "1.34.0", "1.33.1", "1.33.0", "1.32.7", "1.32.6", "1.30.3", "1.30.2", "1.30.0", "1.29.1", "1.28.1", "1.27.5", "1.27.4", "1.27.1", "1.26.2", "1.26.0", "1.25.2", "1.25.1", "1.24.5", "1.24.4", "1.24.3", "1.24.2", "1.24.1", "1.23.5", "1.23.3", "1.23.1", "1.22.1", "1.21.1"]
dates: ["2025-08-22", "2025-06-06", "2025-04-23", "2025-04-18", "2025-02-14", "2025-02-12", "2024-07-10", "2024-04-26", "2024-02-23", "2023-12-27", "2023-11-24", "2023-10-27", "2023-09-22", "2023-07-27", "2023-06-07", "2023-04-14", "2023-02-01", "2022-12-30", "2022-12-22", "2022-11-11", "2022-11-04", "2022-10-28", "2022-10-07", "2022-08-19", "2022-07-29", "2022-07-01", "2022-04-29", "2022-03-31"]
actors: ["Leia"]
---

**Key Terms**: LeiaSR, Weaving, SDK, DirectX, OpenGL, sRGB, API, AES-NI, Late Latching, FPC, ACT, VCP, DDC/CI, EDID, Armadillo, AxProtector, EOS SDK, SBS, IR, DLL, GLM, USB, Leap Motion, Ultraleap, Renderdoc

## LEIASR 1.34.6
**Release Date**: 2025-08-22

### Features

**Support for dual 2D/3D multi-monitor setups**
SR apps sharing window across a 2D and 3D monitor will see the 3D monitor fraction rendered in 3D and the 2D monitor fraction rendered in 2D.

**Dynamic Windowed Weaving**
SR apps rendered in windowed mode can be dragged across screen without losing the 3D effect. Requires latest weaving API.

**Improved platform shutdown speed**
Platform shuts down significantly faster on SR app closing.

**Consolidated SDK examples**
This release contains a more concise set of 5 weaving examples in the SDK (for DirectX 9, 10, 11, 12, and OpenGL.)
Each example demonstrates the same functionality using a different graphics API.
At the top of each example's main.cpp file, the following functionality is available:
*   Use of new weaver interface (default) or old deprecated one.
*   Fullscreen or windowed mode (use F11 to toggle at runtime). Note the changes to the WndProc function that ensures smooth window dragging.
*   Display of 3D geometry, or a stereo image.
*   sRGB support that can be enabled, disabled, or be performed directly in our shaders.
*   Ability to launch on the primary display, secondary display, or automatically onto the attached LeiaSR display.
Examples can be found in the Leia SDK examples/*_weaving folders. Use the CMakeLists.txt file in each folder to build.

### Bug fixes

**Content Truncated for deprecated weaving API**
*   **Symptom**: Content was truncated when using deprecated non-predictive weaving API (1.34.5)
*   **Cause**: Bug in backward compatibility logic
*   **Solution**: Bug fixed

### Known issues

*   **Symptom**: N/A

## LEIASR 1.34.0
**Release Date**: 2025-06-06

### Features

**Windowed Weaving**
Applications can run in resizable, draggable windows without requiring full-screen. Use F11 to toggle between windowed and full-screen modes.

**Updated Weaving Interface**
LeiaSR now provides pure virtual weaver classes for each graphics API, making it easier to extend or customize interfaces while maintaining backward compatibility. Applications must now supply their own view textures, as weaver-managed textures have been removed. Minor changes were made to the weaving function signatures to support windowed weaving. Overall usage remains largely unchanged.

**Faster Tracker Start**
Tracking camera is not automatically disabled on 3D application close anymore, so it is faster to come back up. Behavior can be customized per product in ft_user.ini like so:
`lingerTimeDisable_s = -1; -1 never disable, if >=0 do not disable the camera after pausing until this time in seconds`
`disableOnSuspend = false`

**Eyetracker has raw jpeg shared memory feature for Chat**
Enables applications to access stereo camera feed from tracker for video recording or 3D chat.

**Removed Mono/Stereo tracking options from Dashboard**
OEMs interested to try the mono tracking performance will be given a special runtime build upon request.

**Runtime Component install path**
All components (Tracker, Platform, Dashboard) and Platform Apps (Player, Chat, Viewer) will now be installed in Program Files/LeiaSR by default

### Bug fixes

**Tracking Camera Crash when repeatedly powering on/off display**
*   **Symptom**: Some tracking cameras sometimes shows black image after powering cycling display a few times
*   **Cause**: Trying to enable camera when camera is not ready
*   **Solution**: make sure camera is ready before enabling

### Known issues

*   **Symptom**: N/A

## LEIASR 1.33.1
**Release Date**: 2025-04-23

### Bug fixes

**Tracker not starting on devices where AES-NI is supported by the hardware but not actually enabled**
*   **Symptom**: Tracker not starting
*   **Cause**: AES-NI is supported by the hardware but not actually enabled
*   **Solution**: A runtime check was added to verify AES-NI is enabled before usage. If not enabled, the system now falls back to the legacy software-based encryption method.

**Tracker not available animation shader freeze**
*   **Symptom**: In some apps, the “tracker not available” spinning light animation was freezing
*   **Cause**: Shader logic bug causing animation loop to break
*   **Solution**: Shader code updated to ensure continuous animation loop.

### Known issues

*   **Symptom**: N/A

## LEIASR 1.33.0
**Release Date**: 2025-04-18 (RC4)

### Features

**View resolution set/get method**
The optimal view resolution for weaving is now stored in screen.ini config file and gets an API to get/set. If no data is available in screen.ini the get method returns screen resolution / 2.

**Enable/disable late latching from player.ini**
Late Latching is by default available to LeiaSR developers (and turned on when using the defaults). OEM's can now override and force Late Latching to be permanently on or off for each product code by changing the player.ini (e.g. lateLatching=false)

**Deprecate SR::Screen in favor of SR::Display**
SR::Display will be the only supported method going forward.

**C API wrapper functions for SR::Display**
Retrieve virtual display properties via C API call, updated e.g. in Unity plugin

**DimencoWeaving.dll protection switched from Armadillo to AxProtector**
Armadillo was causing a crash when playing a UE game with EOS SDK enabled

**Weaver returns left view when tracking is not available**
3 options available, can be set per product in player.ini or per device in weaver.ini using flag “show_left_view_when_not_tracking” with options:
*   off: Weaver will weave when not tracking
*   on: Weaver will show the left view when not tracking (DEFAULT)
*   on with shader: Weaver will show left with a spinning animation when not tracking
For instance: `show_left_view_when_not_tracking=on with shader`

**SDK Documentation now included in SDK zip file**
Installer filenames changed to LeiaSR-SDK* and LeiaSR-Runtime*

### Bug fixes

**Crash when weaver is initiated but monitor is disconnected**
*   **Symptom**: Crash
*   **Cause**: Invalid array access
*   **Solution**: Avoid array access when not connected

**DX9 weaver constructor**
*   **Symptom**: Wrong Default parameters
*   **Cause**: N/A
*   **Solution**: Use proper Default parameters

### Product Support

*   Updated product code DM
*   Updated filters and tracker features (grace period, user selection fitness function) in ft_user.ini and act coefs in player.ini

### Known issues

*   **Symptom**: N/A

## LEIASR 1.32.7
**Release Date**: 2025-02-14

### Bug fixes

**Runtime does not connect to FPC for firmware protocol 2**
*   **Symptom**: No connection
*   **Cause**: Will deprecate support for protocol 2 but triggered too early
*   **Solution**: Added support back.

**OpenGL applications sometimes crash with Late Latching**
*   **Symptom**: Crash
*   **Cause**: OpenGL late latching crashes on systems that don't support persistent buffers
*   **Solution**: Disable late latching automatically for those systems.

## LEIASR 1.32.6
**Release Date**: 2025-02-12

### Features

**Face Tracking Enhancements**
*   Customizable 3D view zone
*   Tracked user selection function
*   Grace period for detection
*   improved “Face Overlap“ issue where a viewer would steal the tracking during grace period if passes in front of current viewer.
Can be all modified in the ft_user.ini config file located in "C:\Program Files\Simulated Reality\SR Eye tracker\products\PRODUCT-CODE"

**New Camera type (60fps)**
A new camera type SREyetrackerInputCamera was added, which provides 60 FPS output.

**Improved Runtime Security**
*   Replaced 7zip with a version built with high-entropy ASLR support.
*   Compiled SRService with the control flow guard feature enabled.

**Installer Flag to turn off SRService notifications**
Use /NONOTIFICATIONS flag to disable the notifications.

**Weaver latency defaults (Late Latching)**
*   Changed default latency used by the weavers from 40ms to using 1 frame of latency and late latching to be turned on.
*   Added a cap to the latency value of 150ms to avoid exploding predicted face values when the CPU gets too busy.

**Visualization for Late Latching**
Late Latching dots visualization, you need to modify or create the weaver.ini file located at: C:\ProgramData\Simulated Reality\Devices\[Product Code]\weaver.ini
Set the pattern to be in the 400-499 range will result in late latching dots with a pixel radius of (pattern-400).

**Latency Estimate Optimization (setLatencyInFrames)**
*   Changed latency in frames logic from: (N+1) * MonitorLatency to N * ApplicationLatency + 1 * MonitorLatency, where N is the number of frames set in setLatencyInFrames, MonitorLatency is 1/MonitorFrameRate and ApplicationLatency is 1/ApplicationFrameRate.
*   ApplicationFrameRate will be based on a weighted average.

**Latency Query (getLatency)**
Added method void uint64_t getLatency()to query the currently set latency for all weavers.
*   If setLatency has been called, the value set by that function will be returned.
*   If setLatencyInFrames has been called, the latency will be calculated based on the refresh rate of the monitor and the application.
*   By default, setLatencyInFrames is used when no latency is explicitly set.
*   The return value is in milliseconds.

**Toggle for CrossTalk Correction (ACT)**
ACT stands for “Anti Cross-Talk” and refers to a software-based technique to mitigate the effects of physical cross-talk on the perceived 3D image. The following methods were added to all Weaver classes:
`void setACTMode(WeaverACTMode mode);`
`WeaverACTMode getACTMode() const;`
The following options are available:
*   Off - no ACT applied
*   Static - basic ACT correction, where all pixels are corrected the same no matter the viewer’s head position.
*   Dynamic - advanced ACT correction, where pixels are corrected based on their relative position to the viewer’s head.

**Dynamic ACT correction - xfactor_dc, xfactor_a**
When advanced ACT is performed, the amount of correction applied to a pixel is decomposed into a “dc” static component (forming the basis for basic ACT) and a “dynamic” component that can be modulated using the xfactor_dc and xfactor_a parameters respectively.
These parameters are set “per product” and resides in the player.ini file in "C:\Program Files\Simulated Reality\SR Platform\products\PRODUCT-CODE".
If your product code does not feature this parameter you can always add it manually e.g:
`xfactor_dc = 0.026`
`xfactor_a = 0.05`
Those variables can also be read and updated via API call in the updated SDK (mostly for the purpose of making an ACT tuning App, they are not expected to change at runtime in normal conditions)
`void setCrosstalkStaticFactor(float factor);`
`float getCrosstalkStaticFactor() const;`
`void setCrosstalkDynamicFactor(float factor);`
`float getCrosstalkDynamicFactor() const;`

**Flag for sRGB textures in weaving API**
In order for weaving and ACT function to function optimally, they need to operate on Linear colorspace. So the type of texture fed to the weaving API should always ideally be specified.
If the input SBS image is in Gamma colorspace, it should be explicitly specified. By default all texture inputs and outputs are treated as Linear.

**Added support of Sunplus IR camera**
A simple ad-hoc algorithm has been implemented to cycle over different IR camera configurations to find a face:
*   The current version cycles first through exposure, then enables IR and cycles through gain.
*   If the program is cycling with IR on, and a user is found, IR stays on until user is lost.
NOTE: for IR controls to work, the host device should have the corresponding vendor driver installed - Make sure they are installed and available in PATH. Otherwise, an error message box is displayed.

**Other changes**
*   The non-predictive versions of the weavers are now deprecated.
*   Correction textures are no longer leaking CPU memory.
*   libserialport is now linked dynamically to be compliant with the licensing requirements.
*   Added support for product code EZ.
*   A new camera type SREyetrackerInputCamera was added, which provides 60 FPS output.

### Bug fixes

**Calibration correction image B is wrongly applied**
*   **Symptom**: Incorrect correction
*   **Cause**: Calibration correction image B was incorrectly used, causing the correction to be applied at a factor of 4
*   **Solution**: Fix correction image factor.

**Calibration correction textures are y-flipped in openGL**
*   **Symptom**: Incorrect Correction.
*   **Cause**: Calibration textures were applied with a y flip in openGL
*   **Solution**: Reversed texture y axis in OpenGL

### Known issues

**srRedBlue.exe verification app occasionally crashes**
*   **Symptom**: srRedBlue.exe verification app sometimes crashes with new predictive weaver – we will provide update to either runtime or app to fix.

## SR 1.30.3
**Release Date**: 2024-07-10

### Bug fixes

**SR Session would not enter modern standby on Laptops**
*   **Symptom**: Laptop can't enter modern standby after using the Player.
*   **Cause**: Not all display power events are handled.
*   **Solution**: Handle SERVICE_CONTROL_POWEREVENT.

### Known issues

**Camera on/off messages shown multiple times**
*   **Symptom**: If Camera on/off messages are enabled in Windows, multiple messages are shown when starting an SR app instead of only one ‘Camera on’ message

## SR 1.30.2
**Release Date**: 2024-04-26

### Features

**Notification language support**
We have added support to the notifications for Thai and Ukrainian languages to the SpatialLabs version of the SR platform.

**SR platform version API**
Added a new API endpoint to retrieve the installed SR platform version.

### Other changes

**Support more devices**
Added support for devices with product code BH, EN, ER.

### Bug fixes

**SR Session did not correctly start after startup**
*   **Symptom**: After restarting the device, the SR session would not be running
*   **Cause**: The 32-bit installer would remove the SR session from Windows startup.
*   **Solution**: The 32-bit installer no longer affects the SR Session.

**Weaving examples would stretch if moved to the other monitor**
*   **Symptom**: Moving the weaving examples to the other monitor would stretch them.
*   **Cause**: This behaviour only happened when the manual calibration files were present. In that scenario the incorrect shader would be loaded when moving the application to another monitor.
*   **Solution**: Fixed the logic to utilize the correct shaders.

### Known issues

**Camera on/off messages shown multiple times**
*   **Symptom**: If Camera on/off messages are enabled in Windows, multiple messages are shown when starting an SR app instead of only one ‘Camera on’ message

## SR 1.30.0
**Release Date**: 2024-02-23

### Features

**Support 32-bit applications**
We have added 32-bit binaries to our platform and 32-bit libraries to our SDK, so that 32-bit applications can be developed and run with SR. This is in addition to our 64-bit support: our executables still run on 64-bit and support for 64-bit applications has remained unchanged.

**Improved eye-tracking**
We have created new filters that improve our eye-tracking for both weaving and look-around.

**Manual calibration**
We now read and use manual calibration files in addition to the factory calibration.

### Other changes

**Support more devices**
Added support for devices with product code EH, EI.

### Bug fixes

**Stays in 2D for DirectX9 exclusive fullscreen**
*   **Symptom**: 3D-mode is not activated if rendering in DirectX9 with exclusive fullscreen.
*   **Cause**: DirectX9 adds an invisible child window to windows in exclusive fullscreen mode, which occludes the window and is not recognized by the platform.
*   **Solution**: Do not count this window when checking for occlusion.

**SR Service gets stuck if process name contains wide characters**
*   **Symptom**: If the application name contains wide characters, the application weaves and the camera turns on, but the lens does not turn on and the message “Waiting for connection name” is printed repeatedly in the logs.
*   **Cause**: SR Service reads application name as ANSI and gets stuck when this goes wrong.
*   **Solution**: Correctly read and convert wide characters in application names and do not wait for name if it cannot be read.

**Some images displayed incorrectly by OpenGL image viewer example**
*   **Symptom**: The OpenGL image viewer does not display images correctly if its width in pixels is not divisible by four.
*   **Cause**: Images we read in RGB format while a pixel format of four channels was assumed by OpenGL to determine the width of the image as it was displayed.
*   **Solution**: Read images in RGBA format in the OpenGL example.

### Known issues

**No notifications when using the 32-bit SDK installer after the other two installers**
*   **Symptom**: If first the platform installer is used, then the 64-bit SDK installer and then the 32-bit SDK installer, no SR Windows notifications are shown. Problem does not occur if only the platform installer and the 64-bit SDK installer are used.

**Camera on/off messages shown multiple times**
*   **Symptom**: If Camera on/off messages are enabled in Windows, multiple messages are shown when starting an SR app instead of only one ‘Camera on’ message

## SR 1.29.1
**Release Date**: 2023-12-27

### Features

**SR Licensing**
The platform now supports extracting and reading licenses from FPCs using protocol 4.

**Face lost/found events**
Two new event types are pushed through the system event interface and can be received by SR applications, one for when the EyeTracker starts tracking a user and one for when the EyeTracker has lost the user.

**Face lost delay API function**
The SR::PredictingEyeTracker API class now has a new function to set the face lost delay value.

### Other changes

**Support more devices**
Added support for devices with product code EK.

### Known issues

**Camera on/off messages shown multiple times**
*   **Symptom**: If Camera on/off messages are enabled in Windows, multiple messages are shown when starting an SR app instead of only one ‘Camera on’ message

## SR 1.28.1
**Release Date**: 2023-11-24

### Features

**SR Audio**
Support had been added for SR Audio. Prediction filtered head positions, ear position, and head orientation data to be used for audio applications can now be received through our API.

**DX9 and DX10 weaver support**
Directx 9 and directx 10 weavers are now supported as well. Added image viewer and look around examples using the new weavers to the SDK.

### Other changes

**Changed head position, head orientation and ear position data**
In order to support SR Audio, we changed the head position, head orientation and ear position data. See the documentation in our SDK for the new definitions.

**Support more devices**
Added support for devices with product code EB, EE, DV.

**Device support modifications**
Modified detection limits for device DS.

**Added head pose to documentation**
Modified the SR API documentation in the SDK to include an explanation of the HeadTracker and HeadPoseTracker user interface and the head orientation.

### Bug fixes

**Predicting weaver/eyetrackers do not load correct settings file**
*   **Symptom**: Predicting weavertrackers and eyetrackers used the wrong settings.
*   **Cause**: The settings file from the default location was loaded instead of the product specific one.
*   **Solution**: Correctly load the product specific settings file.

**Opengl weaving example black screen**
*   **Symptom**: Certain devices could display a black screen while the opengl weaving example was running.
*   **Cause**: Window handle was not updated correctly.
*   **Solution**: Correctly updating window handle.

**DirectX10 image viewer example crashes on some devices**
*   **Symptom**: The DirectX10 image viewer example crashes upon launch on some devices
*   **Cause**: Some GPU devices cannot create a texture of the size required by the example
*   **Solution**: Catch the exception and log an error message in the application log when this happens

### Known issues

**Camera on/off messages shown multiple times**
*   **Symptom**: If Camera on/off messages are enabled in Windows, multiple messages are shown when starting an SR app instead of only one ‘Camera on’ message

## SR 1.27.5
**Release Date**: 2023-10-27

### Other changes

**Support more devices**
Added support for devices with product code DY

**Device support modifications**
Modified viewing range for device DS

### Bug fixes

**FPC disconnected notification**
*   **Symptom**: FPC disconnected notification would be shown after sleep/resume on some laptop devices
*   **Cause**: FPC would disconnect and then reconnect after sleep/resume
*   **Solution**: Don’t show FPC disconnected on devices with certain product codes (AL, AM, AY, CM and DQ)

### Known issues

**Camera on/off messages shown multiple times**
*   **Symptom**: If Camera on/off messages are enabled in Windows, multiple messages are shown when starting an SR app instead of only one ‘Camera on’ message

## SR 1.27.4
**Release Date**: 2023-09-22

### Other changes

**Support more devices**
Added support for devices with product code DP, DS, DK, DU

**Remove OpenGL example**
Remove the SDK example named ‘opengl’

**Correct error in documentation**
Correct the subtitle in the documentation

### Bug fixes

**VCP setting can sometimes not be set**
*   **Symptom**: After quickly detaching and reattaching the display cable, the VCP setting can sometimes no longer be set
*   **Cause**: Monitor handle in SR Session is not updated
*   **Solution**: Retrieve current monitor handles directly before changing the VCP settings

**Remove bin folder at uninstall**
*   **Symptom**: After uninstalling SR, the bin folder would be left behind
*   **Cause**: This folder was no longer removed after changes in release 1.26.3
*   **Solution**: Delete this folder explicitly

### Known issues

**Camera on/off messages shown multiple times**
*   **Symptom**: If Camera on/off messages are enabled in Windows, multiple messages are shown when starting an SR app instead of only one ‘Camera on’ message

## SR 1.27.1
**Release Date**: 2023-07-27

### Other changes

**Support more devices**
Added support for devices with product code DM, DQ

### Bug fixes

**SR application gets stretched after detaching and attaching**
*   **Symptom**: If an application using the DirectX11 or DirectX12 weaver is launched on an SR device and this device is detached and then attached, the application content might be stretched to double correct the width.
*   **Cause**: Logic error in loading the right shader in DirectX11 and DirectX12 weavers
*   **Solution**: Load the correct shader in the DirectX11 and DirectX12 weavers depending on whether weaving is currently enabled

**Compiler warning C5208 or error C7626 raised when using SR SDK**
*   **Symptom**: Visual Studio might raise warning C5208 or error C7626 when compiling an application using the SR SDK
*   **Cause**: Unnamed C++-only structs
*   **Solution**: Change unnamed C++-only structs into classes

**VCP setting is sometimes not changed**
*   **Symptom**: The VCP setting would sometimes be incorrect
*   **Cause**: Setting the VCP value can fail without error
*   **Solution**: Check CVP value after it is set and retry setting the value as long as it is incorrect

**Old notifications reappear**
*   **Symptom**: Old, unrelated notifications sometimes reappear if SR device configuration is changed while SR Service is turned off
*   **Cause**: Logic errors in SR Service code cause either all or no notifications to be triggered when SR Service is restarted
*   **Solution**: Determine for each connected device individually whether notifications should be triggered at SR Service start-up

**Size weaving examples becomes incorrect when switching between monitors**
*   **Symptom**: When moving the DirectX11, DirectX12 or OpenGL weaving examples between monitors using the Window + Shift + arrow key combination, the example window becomes the incorrect size on Windows 10
*   **Cause**: Windows 10 does not automatically size the window correctly when this key combination is used
*   **Solution**: Check window size after move events and resize window if necessary

**Errors in generated online API documentation**
*   **Symptom**: Code snippets in online API documentation are missing and HTML tags would be visible as plain text
*   **Cause**: Incorrect paths to code source files and Doxygen error
*   **Solution**: Correct incorrect paths and replace erroneous HTML tags with Doxygen commands

### Known issues

**Camera on/off messages shown multiple times**
*   **Symptom**: If Camera on/off messages are enabled in Windows, multiple messages are shown when starting an SR app instead of only one ‘Camera on’ message

## SR 1.26.2
**Release Date**: 2023-06-07

### Other changes

**Support more devices**
Added support for devices with product code D7

### Bug fixes

**Multiple instances of SR Dashboard can be launched**
*   **Symptom**: For certain customized versions of SR Dashboard, multiple application instances can be launched
*   **Cause**: SR Dashboard is never exited explicitly in these customized versions
*   **Solution**: Exit SR Dashboard explicitly for all versions if it is already running

**Manually added product folders not removed by uninstallation**
*   **Symptom**: If the user manually added product folders to the SR installation, these are not removed by uninstallation
*   **Cause**: Only product folders that were added by installation are removed by uninstallation
*   **Solution**: Remove entire products folder during uninstallation

**DirectX12 image viewer example starts in 2D mode**
*   **Symptom**: If the SR screen is set as the main screen and as the left most screen in the screen configuration, the DirectX12 image viewer example would be launched in 2D mode.
*   **Cause**: In this example, we set the window position only after checking whether the window is on an SR screen
*   **Solution**: Set the window position before checking whether the window is on an SR screen

**C application crashes on SR context destruction**
*   **Symptom**: C application crashes when it destroys SR context after destroying switchable lens hint
*   **Cause**: SR context destructor tries to access pointer to destroyed switchable lens hint
*   **Solution**: Remove switchable lens hint from SR context when it is destroyed

**SR Service crashes when quickly creating and deleting SR context**
*   **Symptom**: SR Service crashes when application quickly creates and destroys SR context repeatedly
*   **Cause**: Connection to application is destroyed while still being initialized
*   **Solution**: Wait for initialization to be completed before accepting destruction event

**SR Service does not recognize USB for some USB configurations**
*   **Symptom**: If any USB port has multiple interfaces (for example, if a virtual machine is installed that can have access to the PC’s USB ports), SR Service may not recognize the attached USB cable of SR device.
*   **Cause**: Each USB port was assumed to have exactly one interface
*   **Solution**: Handle USB ports with multiple interfaces correctly

**DirectX11 image viewer example shows grey screen**
*   **Symptom**: If the main display is attached while the DirectX11 image viewer example is running, the example jumps to the main display while the display the example was launched on shows a grey screen
*   **Cause**: The swap chain was created as non-windowed
*   **Solution**: Create the swap chain as windowed

**DirectX11 image viewer example changes window size**
*   **Symptom**: When the user tries to move the DirectX11 image viewer example between monitors, the window stays on the same monitor and its resolution and window size is changed
*   **Cause**: The window size and position are set explicitly when window size does not match weaver size
*   **Solution**: Remove line that sets the window size and position when window size does not match weaver size

### Known issues

**Camera on/off messages shown multiple times**
*   **Symptom**: If Camera on/off messages are enabled in Windows, multiple messages are shown when starting an SR app instead of only one ‘Camera on’ message

## SR 1.26.0
**Release Date**: 2023-04-14

### Features

**Option to construct SR Context with lens off**
A constructor was added to the SR Context with a parameter if the lens should be on or off. The old constructor (that always turned the lens on at initialization) is now deprecated.

**High framerate support**
Added a function to set the number of frames of latency to be compensated, rather than a fixed time in microseconds. The time to compensate will automatically be calculated from the number of frames and the framerate of the monitor.

**Support DirectX12 textures of typeless format**
Added weaver functions with the input buffer view format as a parameter. Buffers supplied to the weaver are now allowed to be of typeless format.

### Other changes

**Update eye tracker algorithm**
The eye tracker algorithm has been expanded to support more cameras for different products.

**Remove non-API header files from SDK**
Header files have been removed that were accidentally included in the SDK. These files are stb_image.h, leapconnection.h, and internal interfaces between SR components.

**Remove unnecessary DLL endpoints**
Endpoints are only present in the DLL in which they are defined. They are not indirectly included in other DLLs. Endpoints that are not part of the API are removed. Examples that depended on indirectly included endpoints have been corrected to include these endpoints directly.

**Remove GLM include from weaver header file**
Applications that use the weaver no longer unnecessarily include the GLM header.

**Support more devices**
Added support for devices with product code DB, D5

### Bug fixes

**Remaining unsigned DLLs**
*   **Symptom**: Antivirus warnings on install or launch
*   **Cause**: Some DLLs were not digitally signed
*   **Solution**: Digitally sign the DLLs

**DirectX11 Device Draw Sampler Not Set warning**
*   **Symptom**: When using the DirectX11 weaver, a warning is shown EXECUTION WARNING #352: DEVICE_DRAW_SAMPLER_NOT_SET
*   **Cause**: The sampler was null
*   **Solution**: Always initialize the sampler

### Known issues

**Camera on/off messages shown multiple times**
*   **Symptom**: If Camera on/off messages are enabled in Windows, multiple messages are shown when starting an SR app instead of only one ‘Camera on’ message

## SR 1.25.2
**Release Date**: 2023-02-01

### Other changes

**Support more devices**
Added support for devices with product code CT, D2, D3

### Bug fixes

**Unsigned DLLs**
*   **Symptom**: Antivirus warnings on install or launch
*   **Cause**: Some DLLs were not digitally signed
*   **Solution**: Digitally sign the DLLs

**USB camera device sometimes still enabled when not in use**
*   **Symptom**: USB camera device is listed as enabled in Device Manager when not in use
*   **Cause**: Inconsistent behavior for different camera models and start/stop scenarios. Inconsistency between enabling the camera device or camera composite device.
*   **Solution**: Implement consistent behavior: Always leave camera composite device enabled. Enable camera device before use and disable after use

### Known issues

**Camera on/off messages shown multiple times**
*   **Symptom**: If Camera on/off messages are enabled in Windows, multiple messages are shown when starting an SR app instead of only one ‘Camera on’ message

## SR 1.25.1
**Release Date**: 2022-12-30

### Features

**Allow invalid input and output buffer on DirectX12 weaver construction**
When constructing a DirectX12 weaver, the inputFramebuffer and outputFramebuffer are now allowed to be nullptr. Use setInputFrameBuffer and setOutputFrameBuffer to supply a valid frame buffer after construction. Rendering is invalid until they are both set.

**Brazilian Portuguese (SpatialLabs branding)**
Notifications have been added for Portuguese as spoken in Brazil.

### Other changes

**Test patterns**
Weaver test patterns have been added. They can be used in diagnosing issues and will not influence nominal behavior or performance.

**Override locations**
If calibration data is present on the lens control hardware, that will take precedence over calibration data stored in the weaver folder and resources folder on ProgramData.

**SR Dashboard tray icon context menu (Built on SR branding)**
The options of the SR Dashboard tray icon context menu are renamed to ‘SR Dashboard and ‘Exit’.

**SR Dashboard is closed automatically on uninstall**
The SR Dashboard is closed when the uninstaller is invoked to prevent old binaries from being used after uninstallation. Previously the user was asked to do this manually.

**Support more devices**
Added support for devices with product code CZ
Improvements: BF (viewing range)

**Improved logging**
Increase readability of logging when attaching / detaching. Removed excessive log messages stating “Refreshing FPC because of change in...”.

### Bug fixes

**DLL not found error after installation (Built on SR branding)**
*   **Symptom**: When installing SR Platform and the user declines to restart the PC, a message is shown “Error: Unable to load DLL”. Pressing OK will not dismiss the message
*   **Cause**: SR Dashboard was started before the environment PATH variable was updated
*   **Solution**: Pass the environment PATH variable to SR Dashboard

**Windows 11 Smart App Control blocks installation**
*   **Symptom**: With Windows 11 Smart App Control feature turned on, installation of SR Platform shows a notification “Part of this app has been blocked” and installation fails
*   **Cause**: Some DLLs used during installation were not digitally signed
*   **Solution**: Digitally sign the DLLs

**SR Service is not added to Windows services**
*   **Symptom**: SR Service is not listed in Windows services (in Task Manager > Services). SR Service crashes on launch
*   **Cause**: Visual C++ Runtime 140_1 was missing from the installation. Trying to load the missing component caused the SR Service to crash on registering the service
*   **Solution**: Add the Visual C++ Runtime 140_1 to the installer

### Known issues

**Camera on/off messages shown multiple times**
*   **Symptom**: If Camera on/off messages are enabled in Windows, multiple messages are shown when starting an SR app instead of only one ‘Camera on’ message

## SR 1.24.5
**Release Date**: 2022-12-22

### Other changes

**Recognize new EDID for product code AL, AM, AY, CM**
The updated display component is now correctly recognized as the SR display for these products. Previous display components will also still be recognized as before.

**Support more devices**
Added support for devices with product code CG, CU, CV, CX, CY

### Known issues

**Camera on/off messages shown multiple times**
*   **Symptom**: If Camera on/off messages are enabled in Windows, multiple messages are shown when starting an SR app instead of only one ‘Camera on’ message

**SR Service is not added to Windows services**
*   **Symptom**: SR Service is not listed in Windows services (in Task Manager > Services). SR Service crashes on launch
*   **Prevention**: Install Visual C++ Runtime 140_1 before installation

## SR 1.24.4
**Release Date**: 2022-11-11

### Features

**DirectX12 Image viewer example**
Added an image viewer example program for DirectX12.

### Other changes

**OpenGL rendering rework**
Reworked the OpenGL rendering to fix different issues. The OpenGL example was also changed.

### Bug fixes

**Face culling causes black screen**
*   **Symptom**: Changing the DirectX11 rasterizer state to cull front causes a black weaved image
*   **Cause**: The weaver output was being culled
*   **Solution**: Set the weaver to the correct culling mode independent of the application rasterizer state

**Resizing SR app causes ghosting**
*   **Symptom**: Several scenarios, including: After launching an SR app on a conventional monitor and moving it to a different resolution SR monitor with Win+Shift+Arrow key, a ghosting effect is visible
*   **Cause**: Not all internal buffers were resized; DPI scaling was applied incorrectly
*   **Solution**: Resize internal buffers and apply DPI scaling when changing SR app window size

**OpenGL example shows black or red screen**
*   **Symptom**: After quickly and repeatedly switching DS1 on and off, the OpenGL weaved image is solid black or red
*   **Cause**: Multiple causes
*   **Solution**: OpenGL rendering rework

**OpenGL example minimizes when losing focus**
*   **Symptom**: After launching the OpenGL weaving example and using Alt+Tab to give focus to another application, the OpenGL example minimizes
*   **Cause**: Multiple causes
*   **Solution**: OpenGL rendering rework

**OpenGL image viewer example resolution is wrong**
*   **Symptom**: If the main monitor is connected after the OpenGL image viewer example is started, resolution of the example application is wrong if the new and old main monitor dimensions differ
*   **Cause**: Render resolution is equal to the resolution of the main monitor
*   **Solution**: Equal the render resolution to the size of the window client area

**Lens is on when launching on conventional monitor**
*   **Symptom**: When launching an SR app on a conventional monitor, while an SR device is attached, the lens on the SR device turns on
*   **Cause**: The lens state is not always initialized
*   **Solution**: Initialize the lens state to the correct value

## SR 1.24.3
**Release Date**: 2022-11-04

### Bug fixes

**Memory usage and CPU increases to 100%**
*   **Symptom**: SR applications that use the hand tracker can cause memory usage and CPU load to increase to almost 100%. The system can become choppy as a result
*   **Cause**: SR Platform uses Leap Motion / Ultraleap SDK version 5.6.1 for its hand tracking capabilities. This version contains a memory leak
*   **Solution**: Build SR Platform using Leap Motion / Ultraleap SDK version 5.7.2

**Gesture recognizer causes the SR application to crash**
*   **Symptom**: SR applications that use the gesture recognizer may crash
*   **Cause**: Model files were not installed when user selects to restart the PC when prompted during installation
*   **Solution**: Install model files before asking the user to restart

## SR 1.24.2
**Release Date**: 2022-10-28

### Other changes

**Improved battery life**
Some settings to improve SR Eye Tracker performance also cause the battery to drain more quickly. These settings are now only switched on when needed, improving battery life when not using SR.

**Allow invalid window handle on weaver construction**
When constructing a weaver constructor with a window handle parameter, the window handle is now allowed to be invalid. Use setWindowHandle to supply a valid window handle after construction. SR mode will not be enabled when the window handle is invalid.

**Support more devices**
Added support for devices with product code CF, CN, CO.
Improvements: BJ (crosstalk correction), CI (added a variant).

### Bug fixes

**Head pose is all zero**
*   **Symptom**: Head pose values (yaw, pitch, roll, x, y, z) are all 0 for devices with RealSense camera
*   **Cause**: No head pose information is available from the eye tracking algorithm
*   **Solution**: Provide an approximate head pose based on the available information. The center between the eyes is used as the head center

**Lens is on when switching SR Dashboard tabs**
*   **Symptom**: Quickly entering and leaving the Eye Tracker tab will cause the lens to be on
*   **Cause**: Timing issue between different connections with SR Platform
*   **Solution**: Immediately update connection list when starting a connection

**Remove unwanted logging from Unreal editor output**
*   **Symptom**: Unreal editor shows SR application logging in its debug output window
*   **Cause**: SR application logging writes to file and to standard output when using SR
*   **Solution**: Make SR application logging only write to file by default. It is still possible to enable SR application logging on standard output by calling the Logger’s initialize function

### Known issues

**Memory usage and CPU increases to 100%**
*   **Symptom**: SR applications that use the hand tracker can cause memory usage and CPU load to increase to almost 100%. The system can become choppy as a result. Installing the latest Leap Motion / Ultraleap software resolves the issue

**Gesture recognizer causes the SR application to crash**
*   **Symptom**: SR applications that use the gesture recognizer may crash

## SR 1.24.1
**Release Date**: 2022-10-07

### Features

**Head Pose**
Application developers can use HeadSense and HeadPoseSense to get information about the position and orientation of the detected face. The HeadSense gives the eye pair, head center position, head orientation (yaw, pitch, roll) and estimated ear positions. The HeadPoseSense only provides head center position and head orientation. Live head pose data is also added to the Eye Tracker tab of the SR Dashboard.

**Common Weaver interface**
Provide a common weaver interface for DirectX11, DirectX12, and OpenGL. It is now possible to change the input framebuffer, window handle, device context (DirectX11), or command list (DirectX12) after constructing the weaver object. Do not pass invalid arguments to the constructor, even when setting them to a valid value later.

**Leap Motion / Ultraleap Gemini support**
SR HandTracker now works with the latest version of Leap Motion / Ultraleap: “Gemini”. Users with version “Orion” will need to update their Leap Motion / Ultraleap software. Important: Users and developers with Leap Motion / Ultraleap should update to “Gemini”

### Other changes

**Startup programs**
The SR Session needs to start with Windows. The startup link is now placed in registry to prevent accidental removal by the user. The startup link is added for any user on the system and not only the user that performed the installation.

**Start menu SR Dashboard (only in Built on SR branding)**
SR Dashboard link is placed in the Windows start menu folder “Simulated Reality”. Other branding options of the SR Dashboard are not changed: No start menu shortcuts are installed.

**SR Session uses SR icon for all branding options**
The SR Session icon always uses the SR icon instead of an icon specific to the installed branding.

**Installer component selection page removed**
The installer no longer shows a page with check boxes to install different components. Instead it will always install the default selection of components.

**Support more devices**
Added support for devices with product code AS, AX, CE, CI, CJ, CM

### Bug fixes

**SR Dashboard Eye Tracker tab shows old video frame**
*   **Symptom**: When viewing the SR Dashboard Eye Tracker tab, the last frame of the last videofeed session is still visible
*   **Cause**: The window content was not updated when the videofeed ends or the tab is closed
*   **Solution**: Update window content 2 seconds after the videofeed ends or when closing the tab

**Renderdoc cannot load for SR applications**
*   **Symptom**: An SR app analyzed with Renderdoc closes immediately and generates an error: “Error injecting into remote process PID … which is no longer available.”
*   **Cause**: Renderdoc tries to load a part of the weaver that accesses the registry. The IP protection mechanism for the weaver prevents Renderdoc from loading the weaver
*   **Solution**: Remove the registry access that caused Renderdoc to inspect the protected code

**DirectX and OpenGL examples fail when restarting SR Service**
*   **Symptom**: Lens does not turn on
*   **Cause**: Examples did not implement the recommended logic to reconnect to SR Service
*   **Solution**: Reconnect to the SR Service

**Lens turns on when user is on Windows login screen**
*   **Symptom**: Lens turns on when the screen is locked while an SR application is running
*   **Cause**: The SR application is still in focus while Windows is locked. The lock screen overlay was not taken into account
*   **Solution**: Detect when Windows is locked and disable the lens

**DirectX11 example leaves fullscreen mode**
*   **Symptom**: When the DirectX11 example loses focus, it changes to a small window and cannot be restored to fullscreen
*   **Cause**: The application was shown in exclusive fullscreen instead of borderless mode
*   **Solution**: Launch in borderless mode

**C# example crashes on launch**
*   **Symptom**: The C# example closes immediately
*   **Cause**: Cannot load C functions when compiled in AnyCPU architecture
*   **Solution**: Set x64 as default compile architecture

**DDC/CI E0 is not updated when lens changes while detached**
*   **Symptom**: DDC/CI is not updated when the lens changes while the D1 product was detached
*   **Cause**: DDC/CI setting is updated when the requested lens state changes. Sending the command is not possible as the monitor is detached. The command was not resent.
*   **Solution**: Remember the command and resend it on attach.

### Known issues

**Lens is on when switching SR Dashboard tabs**
*   **Symptom**: Quickly entering and leaving the Eye Tracker tab will cause the lens to be on. The lens state is recovered when closing the SR Dashboard or navigating between tabs.

## SR 1.23.5
**Release Date**: 2022-08-19

### Other changes

**Reduced boot time**
Boot time as measured by the Windows Assessment Toolkit has been reduced by ~2 seconds by removing an unnecessary startup link to “StartEyeTrackerWithUSBResets”.

### Bug fixes

**EDID ACR0001-ACR00FF are not detected as DS1**
*   **Symptom**: DS1 with ACR0001 through ACR00FF in EDID will not enable SR mode; DDC/CI E0 setting not changed when enabling and disabling SR mode
*   **Cause**: Matching different EDID values for DS1 was not implemented in all locations
*   **Solution**: Refactor the code for matching different EDID values and remove duplication

**SR Session is not running**
*   **Symptom**: SR Platform will not enable SR mode. SR Session is not running
*   **Cause**: SR Session crashed because of multithreading problems
*   **Solution**: Identify and lock critical sections of the SR Session. Add a recovery mechanism to restart the SR Session when an SR app is launched (if it was not already running)

**Notification shown again on startup**
*   **Symptom**: The last notification that was shown before shutdown, is shown again on startup
*   **Cause**: Events that trigger a notification are always shown as a notification, even if the notification was already shown in a previous run of the SR Session
*   **Solution**: Store a time stamp with the event that triggers a notification. Do not show the notification if the time stamp is before the current launch of SR Session

**Extra items in start menu**
*   **Symptom**: Windows start menu contains items “Simulated Reality” and “SpatialLabs”
*   **Cause**: To show notifications, an application must be registered to Windows. We register SR Session to show notifications in Simulated Reality style and SpatialLabs style. The method of registration caused the notification titles to be added to the start menu
*   **Solution**: Change the registration method to not add start menu items. Previously added items are removed on install

**SR Service stops after suspend/resume**
*   **Symptom**: Sometimes, SR Service is stopped after suspend and then resume
*   **Cause**: When trying to verify the authenticity of the lens control hardware, the connection object from before the suspend was being used
*   **Solution**: Wait until the connection is reopened

**Reconnecting after context invalid event fails**
*   **Symptom**: After reconnecting due to a context invalid event, no SR data are received anymore
*   **Cause**: When the SR app reconnects too quickly, it reconnects to the old connection point. The old connection is no longer used after the new connection point is opened
*   **Solution**: Clean up the old connection point

**Blue square around notification icon**
*   **Symptom**: In Windows 10, the icon shown for a notification has a blue square around it
*   **Cause**: To show notifications, an application must be registered to Windows. The icon background color was not set during registration. The Windows accent color is used
*   **Solution**: Set the icon background color as fully transparent during registration

## SR 1.23.3
**Release Date**: 2022-07-29

### Bug fixes

**USB devices are slow to initialize on startup**
*   **Symptom**: On launch of Windows, the USB devices are not available for 20 seconds
*   **Cause**: Side effect of workaround for Windows serial driver bug. A connection to the USB hub is made to retrieve information. This connection was left open for 20 seconds
*   **Solution**: Close the USB hub connection immediately after retrieving information

**Windows shows notification about requiring a restart**
*   **Symptom**: Windows shows a message about the USB device not initializing correctly and that the PC should be restarted. The message can be safely ignored.
*   **Cause**: Side effect of workaround for Windows serial driver bug. A connection to the USB hub is made to retrieve information. This connection was left open for 20 seconds. Windows presents a message after a timeout
*   **Solution**: Close the USB hub connection immediately after retrieving information

**DDC/CI setting not changed**
*   **Symptom**: With a DS1 and other monitors connected, after detaching a monitor, the DS1 does not write the DDC/CI setting anymore when changing between SR/2D mode.
*   **Cause**: Monitor identifier was invalid after detaching
*   **Solution**: Retrieve new monitor identifier after detach

**Unexpected behavior when attaching and detaching quickly**
*   **Symptom**: Various symptoms related to the connection.
*   **Cause**: Lens control hardware did not reauthenticate
*   **Solution**: Add reauthentication mechanism

### Known issues

**Notification checked again on startup**
*   **Symptom**: The last notification that was shown before shutdown, is shown again on startup.

## SR 1.23.1
**Release Date**: 2022-07-01

### Features

**User guidance**
The user is shown a notification when attaching or detaching the SR device cables, when the SR device is not in the recommended resolution, or when the SR device is duplicated.

**DDC/CI support for legacy SR apps (DS1)**
DDC/CI is now supported for all SR apps regardless of the mechanism they use to switch the lens.

### Other changes

**Support new lens hardware VID/PID**
Add support for new lens hardware versions with a different VID/PID.

**SR Session executable**
The SR Session executable has been added to the SR Platform. It is a background process for SR Platform that should always be running.

**Digital signing**
All programs and libraries are digitally signed. This removes warnings about untrusted programs.

**Improved crosstalk correction**
The crosstalk correction strength now depends on the product type. This reduces the crosstalk (after correction) for most products. Other products already had the optimal setting.

**Added exception documentation on API**
Each API function documentation now lists the type and condition of all SR exceptions it can throw.

### Bug fixes

**Workaround for Windows serial driver bug**
*   **Symptom**: After a USB cable was detached, attaching a USB cable is not detected. The SR device cannot function until the next reboot.
*   **Cause**: The Windows serial driver contains a bug that prevents cleanup of the connection.
*   **Solution**: Reduced failure rate to below 1%. Fixed multithreading problems; Removed unnecessary opening and closing of connections; Delay closing the connection so that there are no timing conflicts; Wait a short time between opening and closing actions.

**SR Eye Tracker not detecting a face**
*   **Symptom**: SR Eye Tracker fails to detect faces that are at an angle
*   **Cause**: The face found in the left and right camera image were incorrectly determined to belong to two different people. That calculation (“back projection error”) contained a mistake where a calibration offset was applied in the wrong direction
*   **Solution**: Correct the calculation

**Monitor not recognized (some device types)**
*   **Symptom**: SR apps with automatic SR/2D switching do not switch to SR mode
*   **Cause**: The monitor identification information is not in the list of known SR devices
*   **Solution**: Added the monitor type to the list

**DirectX12 example misaligned**
*   **Symptom**: DirectX12 example does not switch to SR mode, and the pyramid is not centered
*   **Cause**: The example window is larger than the display in some cases
*   **Solution**: Resize the example window to the display size

### Known issues

**Notification checked again on startup**
*   **Symptom**: The last notification that was shown before shutdown, is shown again on startup.

**Windows shows notification about requiring a restart**
*   **Symptom**: Windows shows a message about the USB device not initializing correctly and that the PC should be restarted. The message can be safely ignored.

**Unexpected behavior when attaching and detaching quickly**
*   **Symptom**: Various symptoms related to the connection. Wait a few seconds between attaching and detaching.

**DDC/CI setting not changed**
*   **Symptom**: With a DS1 and other monitors connected, after detaching a monitor, the DS1 does not write the DDC/CI setting anymore when changing between SR/2D mode.

## SR 1.22.1
**Release Date**: 2022-04-29

### Features

**SR Eye Tracker for face masks**
The eye tracker algorithm has been retrained for users wearing a face mask. They will now be tracked just as easily as users without a face mask. Overall tracking rate improved for both groups.

**C functions for getting lens state**
Added C functions “isLensHintEnabled” and “isLensHintEnabledByPreference”.

### Other changes

**Support new monitor identification**
ACR0000 through ACR00FF are identified as DS1.

**Eye Tracker visualization in Dashboard**
The visualization in the Eye Tracker tab of the SR Dashboard now shows the facial landmarks being tracked, instead of only the eye positions and a circle around the face.

**Image viewer example**
New examples “example_directx11_image_viewer” and “example_opengl_image_viewer” have been added to the SDK, documenting how to create a simple application with weaving.

### Bug fixes

**Apple iTunes conflict**
*   **Symptom**: Only when Apple iTunes is installed, the visualization in the Eye Tracker tab of the SR Dashboard shows a black frame.
*   **Cause**: Apple iTunes and the SR Service use the same network port.
*   **Solution**: SR Service requests an available network port from the operating system.

**Device Manager flashing**
*   **Symptom**: Device Manager reloads the device list every few seconds when not using SR.
*   **Cause**: The lens control hardware is disabled when not in use to allow the system to enter sleep or hibernate mode. It is briefly enabled every second to check the connection. The enable and disable events cause Device Manager to reload the device list.
*   **Solution**: The lens control hardware is only disabled when the system enters sleep or hibernate mode.

**No calibration data on early Coldplay devices**
*   **Symptom**: Calibration data is missing for devices where the device serial number is not set.
*   **Cause**: The calibration data is usually stored in a folder with the device serial number. The empty serial number causes the folder name to contain invalid characters.
*   **Solution**: Store the calibration data in a folder without special characters.

## SR 1.21.1
**Release Date**: 2022-03-31

### Features

**Attach and detach devices**
SR Devices can be attached and detached without reinstall or reboot. The calibration is automatically updated. Only one SR device is supported at the same time.

**Monitor 3D mode**
Selected SR monitors (DS1) will automatically turn off color settings that cause a bad experience in SR mode. The user settings are restored when leaving SR mode.

### Other changes

**Application logging**
Logging is automatically enabled for how SR applications use the SR Platform. The logs can be found in “C:\ProgramData\Applications\<application name>\Log”

**Device support**
Added support for Evoque (product code AY)

### Bug fixes
*   System Status stays open in tray when pressing close button
*   System Status exposes extra tabs not intended for end users
*   Unreal applications cannot be started from the Unreal Editor
*   Unreal applications in debug mode can crash on exit