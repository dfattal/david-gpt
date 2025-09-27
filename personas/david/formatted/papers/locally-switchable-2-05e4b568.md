---
title: "Locally Switchable 2D and 3D Displays"
docType: "paper"
url: "/Users/david.fattal/Documents/GitHub/david-gpt/personas/david/RAG-RAW-DOCS/Papers/Locally Switchable 2D and 3D Displays.pdf"
scraped_at: "2025-09-26T20:00:38.990Z"
word_count: 1938
extraction_quality: "high"
authors:
  - name: "Sung Lee"
    affiliation: "Leia Inc."
  - name: "Abe Mammen"
    affiliation: "Leia Inc."
  - name: "Xiaojun Zhang"
    affiliation: "Leia Inc."
  - name: "Andre Krebbers"
    affiliation: "Leia Inc."
  - name: "David Fattal"
    affiliation: "Leia Inc."
venue: "Information Display"
publicationYear: 2023
abstract: "In a 2D/3D switchable display, the 2D and 3D regions can be defined independently on screen on a per-pixel, per-timeframe basis. This paper demonstrates the first fully 'local' 2D/3D switchable display. The approach is based on Leia Inc.'s core Diffractive Lightfield Backlight (DLB) technology and consists of lighting up an LCD display with a temporally multiplexed dual 2D/3D backlighting system. This allows for negligible performance degradation in 2D mode and overcomes the poor rendering of text or high-resolution graphics in 3D mode. The paper details the experimental system, timing control, content driving, and performance metrics, showing good separation between 2D and 3D zones and paving the way for fully local 2D/3D displays using widely available LCD technology."
keywords": []
technologies": ["lightfield", "autostereoscopic displays", "2D/3D switching", "display technology"]
---
# Locally Switchable 2D and 3D Displays

## Abstract
In a 2D/3D switchable display, the 2D and 3D regions can be defined independently on screen on a per-pixel, per-timeframe basis. This paper demonstrates the first fully 'local' 2D/3D switchable display. The approach is based on Leia Inc.'s core Diffractive Lightfield Backlight (DLB) technology and consists of lighting up an LCD display with a temporally multiplexed dual 2D/3D backlighting system. This allows for negligible performance degradation in 2D mode and overcomes the poor rendering of text or high-resolution graphics in 3D mode. The paper details the experimental system, timing control, content driving, and performance metrics, showing good separation between 2D and 3D zones and paving the way for fully local 2D/3D displays using widely available LCD technology.

## Introduction
As the 3D content creation ecosystem matures, it is causing a resurgence of autostereoscopic (glasses-free) 3D displays. They represent a compelling alternative to head-mounted displays, delivering immersive 3D experiences without the encumbrance of eyewear. Recently, they have been adopted in a host of familiar devices, including tablets, laptops, and monitors. A key feature of these new-generation displays is 2D/3D switchability, enabling the device to function in its original "2D" state with negligible performance degradation, especially resolution. People can deploy the device in this normal 2D mode for routine functions (such as checking emails or browsing the web) or the 3D mode for watching 3D movies or engaging in 3D immersive games.

To date, 2D/3D switchability in these commercial devices has been "global" in the sense that the whole display switches from one state to another. A known shortcoming of this method is the poor rendering of text or high-resolution graphics in 3D mode, precluding the embedding of 3D content in normal web pages or making flat user-interface (UI) elements in 3D games look pixelated. Many original equipment manufacturers consider local switchability a must in their future roadmap. Local segmented switchability is another option, but it frequently adds significant complexity and only partially addresses the problem.

Thus here, we demonstrate (to our knowledge) the first fully "local" 2D/3D switchable display, where the 2D and 3D region can be independently defined on screen on a per-pixel, per-timeframe basis. The approach is based on Leia Inc.'s core Diffractive Lightfield Backlight (DLB) technology and consists of lighting up an LCD display with a temporally multiplexed dual 2D/3D backlighting system.

## Diffractive Lightfield Backlight
DLB is a technique developed at HP Labs and commercialized by Leia Inc. A nanostructured light-guiding DLB layer is introduced in a regular LCD display stack between the standard backlight (BL) unit (such as edge-lit, backlit, or miniLED) and the active panel.

In 2D operation, the regular BL illuminates the LCD panel through the inert DLB layer, resulting in a full-resolution, full-brightness image. Residual reflections and diffractions from the DLB layer are typically between 5 to 10 percent.

In 3D operation, the DLB layer is edge-lit by a dedicated LED system and scatters guided light upward only, resulting in highly directional light to propagate through each LCD pixel. Switching between 2D and 3D modes is as fast as turning on and off an array of LEDs, typically a few microseconds. The system is compatible with a scheme where a fast LCD panel would display a sequence of 2D and 3D images in synchronization with an alternating 2D/3D illumination scheme.

## Methods

### Temporally Multiplexed DLB
In designing a temporally multiplexed DLB system, controlled timing between the dual BL and the LCD 2D/3D image sequence is critical. Note that the response time of the liquid crystal is finite, and the pixels are updated in a rasterizing fashion. If not careful, a mismatch between illumination and images will occur, resulting in regions of the screen with blurry 3D or low-resolution 2D.

Fig. 2 shows a proper timing sequence for BL and LCD assuming a refresh rate of 120 Hz (with a cycle time of ΔT~8.33 ms). Once the LCD finishes a raster cycle (ΔTraster) for the 2D image and the liquid crystal of the last row of pixels settles (ΔTLC), the 2D BL flashes for a short duration (ΔTBLU). The sequence repeats, but this time the LCD rasterizes the 3D image and the 3D BL flashes. The diagram shows the straightforward process, and no 2D/3D cross-contamination will occur as long as:
ΔTraster + ΔTLC + ΔTBLU < ΔT. (1)

The scheme would work flawlessly with timings listed in the first row of Table 1, which is well within commercially available current LC technology. For this proof of concept, we use off-the-shelf technology with slightly slower timings, which still demonstrates the local 2D/3D feature in a wide (and adjustable) portion of the screen.

### Experimental System
For the experimental demonstration, we used an off-the-shelf 4K ultrahigh definition (UHD), 15.6-inch, 120-Hz LCD display from AUO with a head-tracked DLB 2D/3D system, providing 2D images at a resolution of 3,840 x 2,160 and 3D images at an effective resolution of about 1,920 × 1,080. Table 1 (second row) shows the relevant timings. Even though the display raster time is on the long side, we still operate the BL and display sequences at a rate of 120 Hz and are able to define a very wide portion of the screen with clean synchronization between the BL and image.

The combined 2D/3D cycle takes 16.67 ms to complete, so the local 2D/3D content is experienced at an effective refresh rate of 60 Hz. Our default timing for the LED strobe is during the vertical black (VB) period immediately following the end of the display raster for both 2D and 3D images. To achieve this timing, the time control (TCON) 120-Hz STV1 test point output is connected to the BL driving board. After displaying a 2D image, the 2D LED is strobed; after a 3D image, the 3D LED is strobed, creating a temporally multiplexed hybrid 2D/3D image at 60 Hz.

For the 15.6-inch panel, the vertical sync (VS) period is ~430 us, which is ~5 percent of the 120-Hz frame cycle and 2.5 percent of the 60-Hz combined image cycle. To conserve the same brightness as the normal display, the peak current of the strobing LEDs ideally should be boosted by a factor of 40, from 30 mA to ~1,200 mA.

For the purpose of this demo, we modified the BL driving scheme to drive the LEDs close to their maximum current spec of 200 mA using a TI LP8866 200 mA device, with the maximum duty cycles set at 10 percent. The microcontroller unit (MCU) includes a BL safety control function to protect the LED in the event of an overcurrent issue.

### Content Driving and Co-existence
In the system, we want 2D and 3D content to co-exist within the same display frame. Furthermore, we do not want to enforce restrictions with respect to placement of 2D and 3D regions, to account for both cases where they might intersect each other or be independent. This provides maximum flexibility from a content authoring perspective while preserving image fidelity. Our goal was to render high-quality 2D text within overlapped 3D regions as well as in independent regions, such as window toolbars, buttons, and hover regions.

To match the switching DLB technology interleaving independent 2D and 3D frames at a 120-Hz refresh rate, a content rendering system was developed to precisely deliver alternating 2D and 3D rendered frames every 16.33 milliseconds.

### Switching as a Software Model
A hybrid application supports two rendering threads that operate autonomously; a presentation manager (PM) joins their respective outputs so the interleaved switching drives either a single display port or two display ports. Each thread uses a set of back buffers to render into, and the PM sequences these for precise switching. In addition, each rendering thread can parallelize and balance its workload through the allocated set of back buffers. From a software perspective, the PM manages the switching in the background, while the main application focuses on the task of rendering-UI control. The PM exposes a set of methods for buffer management and synchronization for application conformation.

### Swapping via an Interleaving Approach
To prevent screen tearing and decouple rendering from the display scan, graphics systems use back buffers and its associated set of application program interfaces (APIs) to control the output of high-performance rendering applications. For this hybrid system, we allocate a pool of back buffers that are assigned to the respective 2D/3D renderers. When a "swap" request is made, these buffers are advanced in an interleaved fashion. For a four back buffer organization, 2D is allocated buffers B0, B1, B2, and B3, while 3D receives buffers B4, B5, B6, and B7. The interleaving sequence swaps buffers in this order: B0, B4, B1, B5, B2, B6, B3, B7, and so on. Table 2 describes the allocation of buffers for hybrid displays.

To achieve maximum overlap and parallelism for this example of four back buffers per rendering channel, while one buffer is being used to drive the output display, the other buffers are available to render into. To precisely present buffers to the respective panel BL control, the 2D/3D renderers have a maximum of 16.33 milliseconds to complete its task. By having additional buffers, each pipeline can locally maximize its time slot. Fig. 4 shows B2 (frame 2) can complete in 10 milliseconds, thus allowing B3 (frame 3) to now have 16.33 + (16.33-10) = 22.33 milliseconds to complete.

If a back buffer has not completed rendering before it is needed for a switch, the previous buffer in the chain continues as the "current present buffer." In Fig. 4, if B2 is not ready in time, the display is scanned out of buffer B1. While this is normal behavior for a single pipeline swap buffer system, there is added complexity in this interleaved system, as we have two independent sets of buffers within a single swap chain layout.

### Buffer Pixel Layout
In support of Leia's dual BL system, the 2D/3D frame buffer contents have their respective regions set to black, which is rendered by the other buffer. In Fig. 5, 2D content is present on the top, right, and bottom. The 3D content is present in the middle left, with a shared region of 2D (e.g., text, banner, and ticker) overlaid on top of the 3D.

## Results
Fig. 6 shows a photograph of the display screen in local 2D/3D mode. The 3D video content is shown from YouTube in a small window with a "clean" 2D UI around it. Both the 3D effect of the content in the window and the legibility of the small font text in the UI region are excellent.

To showcase the obvious gain of resolution in the 2D zone, Fig. 7 shows the same small font text content rendered in the 2D region and 3D region, respectively. The text is indecipherable in the 3D zone but perfectly legible in the 2D zone.

To further quantify the performance of the display in hybrid mode, we performed the following luminance measurements in nine locations on the screen (top, middle, bottom and left, center, right):
- (L2D2D) 2D BL strobing, 3D BL off, white 2D image, black 3D image
- (L3D3D) 2D BL off, 3D BL strobing, black 2D image, white 3D image
- (L3D2D) 2D BL off, 3D BL strobing, white 2D image, black 3D image
- (L2D3D) 2D BL strobing, 3D BL off, black 2D image, white 3D image

We first adjusted the BL driving currents to equalize L2D2D, and L3D3D then defines 2D-to-3D and 3D-to-2D cross-talk metrics as C2D3D = L2D3D/L3D3D and C3D2D = L3D2D/L2D2D, respectively. The results, reported in Table 3, show that good separation between image and cross-illumination are achieved in the top and middle part of the display and start degrading toward the bottom because of the limited raster speed of the display.

By adjusting the strobing timing to be earlier or later than that of Fig. 2, the "good" hybrid region could be adjusted at will (to cover a wide middle portion of the display or the bottom of the display).

## Summary
As we usher in a seamless era of 3D content creation, 2D/3D switchability is the chief mechanism to enable this technology to flourish. With that in mind, we used a dual BL Leia display operated in strobing mode to demonstrate per pixel, per temporal frame control over 2D or 3D display output. A liquid crystal response time below a 4-ms LED strobing time of half a millisecond and a display raster rate below 4 ms would lead to good hybrid performance across the display. Although the display's raster time was slower (~8 ms), it still showed good performance with hybrid operation in approximately two-thirds of the display area. This work paves the way to fully local 2D/3D displays using widely available LCD technology on the market today.

## References
1. Geng, J. (2013). Three-dimensional display technologies. Advances in Optics and Photonics, 5(4), 456-535.
2. Leia nubia Pad 3D. (2023). https://ztedevices.com/en-gl/nubia-pad-3d/.
3. Acer. (2022). Acer expands stereoscopic 3D lineup with SpatialLabs View Series displays. https://news.acer.com/acer-expands-stereoscopic-3d-lineup-with-spa-tiallabs-view-series-displays.
4. Asus. (2022). ProArt Studiobook 16 3D OLED. https://www.asus.com/laptops/for-creators/proart-studiobook/proart-studiobook-16-3d-oled-h7604/.
5. Willemsen, O.H., De Zwart, S.T., Hiddink, M.G.H., & Willemsen, O. (2006). 2-D/3-D switchable displays. Journal of the Society for Information Display, 14(8), 715-722.
6. Hiddink, M.G.H., de Zwart, S.T., Willemsen, O.H., & Dekker, T. (2006). 20.1: Locally switchable 3D displays. SID Symposium Digest of Technical Papers, 37(1), 1142-1145.
7. Li, Q., Deng, H., Yang, C., He, W., & Zhong, F. (2022). Locally controllable 2D/3D mixed display and image generation method. Optics Express, 30(13), 22838-22847.
8. Fattal, D., Peng, Z., Tran, T., Vo., S., Fiorentino, M., Brug, J., & Beausoleil, R.G. (2013). A multi-directional backlight for a wide-angle, glasses-free three-dimensional display. Nature, 495(7441), 348-351.
9. Thauvette, J., DiGiovanni, N., & Khong, Y. (2022). Dell Alienware AW2723DF monitor review. https://www.rtings.com/monitor/reviews/dell/alienware-aw2723df.