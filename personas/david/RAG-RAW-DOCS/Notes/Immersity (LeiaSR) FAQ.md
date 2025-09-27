# Immersity (former LeiaSR) Platform FAQ

## Display Technology

### What was Leia's original display technology?

**A:** Our first-generation tech was the Diffractive Lightfield Backlight (DLB), developed at HP Labs. It used nanoimprinted diffractive elements in the LCD backlight to steer light into multiple viewing zones. DLB powered devices like the Red Hydrogen One and Leia Lume Pads.

**Strengths:**
- Ultra-fast 2D↔3D switching (microseconds)
- True lightfield experience

**Limitations:**
- LCD-only (not compatible with OLED or microLED)
- Required dual illumination systems (added cost)
- Optical efficiency ~50% in 3D mode
- Color and uniformity challenges from wavelength-specific diffraction

### What is Leia's current display technology?

**A:** We pivoted to switchable Liquid Crystal (LC) lens technology, also called the 3D Cell, after acquiring Dimenco and the Philips 3D patent portfolio.

**How it works:**
- A switchable LC optical layer sits on top of any base display (LCD, OLED, microLED)
- In 2D mode: fully transparent (~98% transmission), no brightness or color loss
- In 3D mode: LC forms tiny lenses that direct left/right perspectives to your eyes, enabling glasses-free stereo (also in that mode ~98% transmission), no brightness or color loss
- Paired with head tracking, the system ensures that the correct view is delivered to each eye, maintaining immersion and minimizing crosstalk even as the user moves

### What are the benefits of LC lens over DLB?

**A:**
- Broad compatibility with all major display types (LCD, OLED, microLED)
- Near-lossless optical quality (~98% transmission in both modes)
- Extremely low crosstalk (<2% in production)
- Integration simplicity for OEM partners
- Both preserve full 2D resolution, with the common tradeoff of ~half resolution in 3D mode

### How do you map 3D content to screen?

**A:** Our Stereo View Mapping algorithm combines three key inputs:

1. The user's exact head position at presentation time (the moment the 3D image appears on screen)
2. Precise display calibration data
3. The input 3D content (left and right views)

Using this information, the algorithm assigns a value to each display subpixel, selecting from the left or right image as needed. This ensures that the left eye sees only the left view and the right eye sees only the right view — with minimal crosstalk.

The process runs dynamically and adapts in real time, even during fast head movements. Importantly, it's done entirely in software, with no moving or active parts in the display system.

- Real-time head tracking predicts user motion
- Views are dynamically re-rendered to match eye positions
- This minimizes crosstalk and maximizes immersion, even during fast head movement

### Tell me more about your Advanced Calibration

**A:** Each display is factory-calibrated using a dedicated end-of-line tool at the OEM/ODM site. This process simultaneously calibrates the tracking camera and the alignment of the 3D cell to the base display, with all calibration data stored in the flash memory of the display FPC.

**The calibration data includes:**
- Lens alignment to display (translation, rotation, spacing/gap)
- Lens mechanical deformation (non-linear stretch or warping)
- Tracking camera alignment to display
- Static & dynamic crosstalk maps (used by our runtime crosstalk mitigation software)

With this calibration data, our Stereo View Mapping software compensates for any alignment imperfections or lens deformation. The result is a near-perfect 3D image, consistently sharp and immersive across all units.

### Where is this technology deployed today?

**A:** It powers a growing range of devices, including:
- Acer SpatialLabs laptops and monitors
- Asus and Lenovo systems
- Samsung Odyssey 3D gaming monitor
- Mobile devices like ZTE Nubia Pad 2 and Red Magic Explorer

### What is Leia's broader vision for its tech?

**A:** Our goal is to make depth as standard as touch. With the Immersity platform, we're delivering a full-stack solution that combines next-gen 3D-ready displays with AI software for real-time 2D→3D conversion and spatial interaction. This will change how people create, consume, and experience digital media — bringing the world to life on their screens.


## Tracking Technology

### What hardware is recommended for head/eye tracking?

**A:** We recommend the following tracking camera configurations:

#### Monitor/Laptop Standard Stereo Tracking
*(Good performance/cost tradeoff, Acer standard config)*

- **Resolution:** 480p
- **Frame rate:** ≥60 fps
- **Baseline:** 120mm
- **FOV:** ≥80° horizontal to cover natural head motion
- **Color:** Monochrome

This balance provides accurate tracking with low latency while keeping cost and power reasonable for OEMs.

#### Monitor/Laptop Stereo Tracking w/ Video Chat

- **Resolution:** ≥720p
- **Frame rate:** ≥60 fps
- **Baseline:** 60mm
- **FOV:** ≥80° horizontal to cover natural head motion
- **Color:** RGB

#### Mobile Mono Tracking

- **Resolution:** ≥720p
- **Frame rate:** ≥60 fps, 90-120 fps preferred
- **FOV:** ≥80° horizontal to cover natural head motion

> **Optional second cam for video chat (ZTE config):**
> - **Baseline:** 25-40mm
> - **Color:** RGB

### Mono camera vs stereo camera — what's Leia's take?

**A:** Leia has experience with both mono and stereo camera tracking across different product lines.

- **Stereo cameras:** Physically triangulate facial features to locate them in 3D space. We recommend stereo tracking for laptops and monitors, where users sit farther from the display and wider tracking angles are required. Stereo setups also enable high-quality 3D selfies, video, and chat, since both eye tracking and content capture can be done simultaneously. On Windows devices, our Runtime can use the stereo feed for both tracking and recording at the same time — a unique advantage.

- **Mono cameras:** Use advanced neural networks to infer 3D head/eye position from a single image. Today, mono tracking is accurate and efficient enough for mobile devices, where viewing distances are shorter and user angles relative to the screen are smaller. On mobile, a single camera handles tracking, while a second (if present) is reserved for "second view" capture (e.g. 3D selfies or video). This avoids overloading the processor with redundant tracking tasks.

> **Summary:**
> - Mobile devices → Mono tracking (efficient, sufficient accuracy, optimized for small form factor)
> - Laptops/monitors → Stereo tracking (greater range, accuracy, and added 3D content capture features)

### What about "no camera" tracking for privacy?

**A:** Some OEMs opt for on-chip/ASIC eye-position computation. In this setup, the raw camera feed never leaves the dedicated chip; only the anonymized eye position data is shared with the system. This design provides strong privacy protection while still enabling robust 3D rendering. Leia's software is fully compatible with this architecture as long as accurate eye positions are provided to the Runtime for 3D rendering. 

## Display Runtime/SDK

### Crosstalk Mitigation

#### What do we mean by Crosstalk Mitigation?
**A:** Software-based methods that minimize — and in some conditions cancel — visible cross-talk between left and right images.

#### How does it work?
**A:** Our approach is dynamic: we leverage display calibration data and the user's head position to adjust cross-talk compensation coefficients in real time as the user moves.

#### What else contributes to low crosstalk?
- Optimized lens design (naturally low baseline crosstalk)
- Joint calibration of display + eye tracking (no added XT for static user)
- Predictive tracking (no added XT for moving users up to ~8 rad/s²)

#### What's the key takeaway?
All elements must work together — lens, calibration, prediction, and dynamic software — to deliver an optimal 3D viewing experience.

### Late Latching (Application Latency Reduction)

#### What is Late Latching?
**A:** A latency reduction technique for stereo rendering pipelines (DX11, DX12, OpenGL).

#### Why is it needed?
Applications often buffer frames to maintain stable FPS. If stereo weaving happens before buffering, head-tracking data is already outdated by the time the image is displayed.

#### How does Late Latching solve this?
Stereo weaving is deferred to the last possible step, just before scan-out. This ensures the display always uses the freshest head-tracking data, eliminating extra application-induced latency.

### Windowed Weaving

#### What is Windowed Weaving?
**A:** The ability to run a 3D application in windowed mode (not fullscreen) without losing the 3D effect.

#### Why is this challenging?
Operating systems often cache window contents while dragging, which breaks the stereo effect.

#### How do we solve it?
We use intimate knowledge of the lens design to ensure the 3D effect stays correct even when the window is moved.

### Multi-Screen Support (Mixed 2D/3D)

#### What does Multi-Screen Mixed 2D/3D support mean?
**A:** It allows applications to run across heterogeneous displays. The part of the window shown on a 2D monitor is rendered in 2D, while the part shown on a 3D monitor is dynamically weaved into stereo.

#### What is supported today?
Currently, we support this function for one 2D screen and one 3D screen.

#### What is the long-term goal?
Our roadmap includes full multi-screen support, meaning a single window can span any number of 2D and 3D monitors, with each segment rendered correctly (2D or 3D) depending on the monitor. This is planned for release later this year.

**Key Benefit:** Users can seamlessly work across mixed display setups without breaking the 3D effect.

## SDK + Runtime Distribution

### How are the SDK and Runtime related?
**A:** The SDK introduces new developer-facing features and therefore always requires an associated Runtime that supports those features.

### How does Leia handle compatibility? 
**A:** We aim to keep Runtime backward-compatible with older apps/SDKs for as long as possible. Internally, we commit to maintain binary compatibility for at least two years, and in practice expect to support older runtimes much longer—unless a major architectural change makes that impossible.

### How are SDK and Runtime distributed?
**A:** The SDK and Runtime are NOT distributed in the same way:
- The SDK is publicly available for developers
- The Runtime (Immersity/LeiaSR) is delivered only to licensed OEM customers, who decide which Runtime version they ship in their products and are responsible for updating it

### Are there exceptions?
**A:** Yes. At Leia's discretion we can share future Runtime previews with key ecosystem partners (for example, Zoom or a top gaming studio) so they can develop and test against upcoming features before the official release.
