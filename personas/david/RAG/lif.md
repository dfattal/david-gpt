---
id: lif-and-lvf
title: Leia Image Format (LIF) and Leia Video Format (LVF)
type: technical_note
personas: [david]
summary: A technical overview of the Leia Image Format (LIF) and Leia Video Format (LVF), detailing their structure, purpose, and specifications for creating and displaying 3D content.
identifiers:
  format_id: LIF-5.3
---

**Key Terms**: LIF, LVF, disparity map, view synthesis, XR, Extended Reality, Quad, SBS, side-by-side, convergence, reconvergence, camera intrinsics, camera extrinsics, depth layers, blob_id, outpainting.
**Also Known As**: Leia Image Format, Leia Video Format, 4V videos.

## Overview

The Leia Image Format (LIF) and Leia Video Format (LVF) are proprietary container formats developed by Leia Inc. to capture, create, and experience immersive 3D media. These formats are central to the Leia ecosystem, enabling content to be displayed with depth on Leia's light field displays as well as on traditional 2D screens.

LIF is designed for still imagery, encapsulating multiple viewpoints of a scene, each paired with a high-quality disparity (depth) map. This structure is essential for the view synthesis process, allowing for the rendering of 3D images with interactive parallax. LIF files can be decomposed into distinct depth layers, each containing its own RGB texture and disparity map, which facilitates advanced applications in Extended Reality (XR) and Augmented Reality (AR). The format is versatile, supporting rendering in 2D, 3D stereo, and interactive 3D modes across a variety of devices.

LVF extends this capability to video, replacing older formats like the Hydrogen One's "4V videos." It is designed for maximum compatibility by encoding two separate video streams: a primary 2D stream (left view) for legacy devices and a secondary stream (right view) that enables full 3D playback on Leia-compatible hardware. This dual-stream approach ensures that 3D video content remains accessible on standard 2D platforms while providing a rich, immersive experience on 3D displays. LVF also introduces a flexible metadata system for handling convergence on-the-fly, allowing for dynamic adjustments during playback.

## Leia Image Format (LIF) Details

### Purpose and Use Cases

The primary purpose of the Leia Image Format (LIF) is to provide a standardized container for 3D imagery that is both rich in depth information and broadly compatible. It is engineered to support a range of visual experiences, from simple 2D viewing to fully interactive 3D on specialized hardware.

LIF is crucial for applications that leverage depth-rich visuals, particularly in the growing field of XR (Extended Reality). By storing multiple viewpoints and detailed disparity maps, LIF files serve as the foundation for generating holographic-like images. The format's ability to be decomposed into depth layers makes it highly suitable for AR applications, where virtual objects need to be realistically integrated with the real world. Key use cases include immersive social media, 3D content creation tools, and visualization platforms where depth perception is critical.

### Technical Structure

The technical foundation of LIF is its multi-view and layered depth architecture. This structure ensures that all necessary data for high-quality 3D rendering is self-contained within the file.

*   **Multi-view Support**: A single LIF file can store one, two, or potentially more distinct viewpoints of a scene. This is fundamental to creating the illusion of depth and parallax.
*   **Disparity Maps**: Each viewpoint is accompanied by a high-quality disparity map, which encodes the depth information for every pixel. The accuracy of this map is critical for the quality of the final 3D effect.
*   **Layered Depth**: For advanced applications, the views within a LIF file can be further decomposed into multiple depth layers. Each layer consists of its own RGB texture and a corresponding disparity map. This layered approach is instrumental for complex view synthesis algorithms used in XR and AR rendering.
*   **Data Completeness**: A key constraint of the format is that every view or layer must contain both an RGB texture and a disparity map. This ensures that the rendering engine always has the necessary data to synthesize new views correctly.

### Creation and Consumption

LIF files can be generated from a variety of sources and are designed to be consumed across multiple platforms.

*   **Creation Sources**: LIF content can be created using Leia's proprietary tools, such as Immersity AI (available on web and mobile) and the Immersity SDK (for Windows and Android). The Leia Camera SDK also enables direct LIF capture. Furthermore, standard third-party stereo images, such as Left-Right (L-R) or Side-by-Side (SBS) formats, can be converted into LIF files.
*   **Processing Pipeline**: Depending on the input source, additional processing steps may be required. This often involves generating or refining the disparity maps using AI-powered estimators and decomposing the image into the necessary depth layers for advanced rendering.
*   **Platform Compatibility**: LIF images are designed for broad compatibility. They can be rendered in standard 2D, interactive 2D (with parallax effects), 3D stereo, and fully interactive 3D (XR) modes. This adaptability extends across web browsers, LeiaSR devices, and other XR hardware.
*   **Metadata Preservation**: When sharing LIF files, metadata preservation is a concern. Platforms like Email and Discord typically preserve the necessary metadata for 3D display. However, many other messaging apps and social media platforms may strip this metadata, causing the image to revert to a standard 2D JPEG unless the file is shared within a compressed archive like a ZIP file.
*   **Versioning**: Legacy compatibility is maintained, though older LIF versions (below 5.3) may be interpreted as 2D images by some modern applications.

## LIF 5.3 Specification

The LIF 5.3 specification represents a significant advancement in the format, introducing a detailed JSON structure to store a comprehensive set of camera parameters and animation data. This allows for more precise view synthesis and enables dynamic, animated 3D effects. The specification captures camera intrinsics (like focal length) and extrinsics (like position and rotation) for each view, providing a complete description of the camera space.

The following JSON object illustrates the detailed structure of a LIF 5.3 file. It includes a `views` array describing each camera viewpoint, its physical properties, and its associated image and depth map data (`inv_z_map`). It also defines `layers_top_to_bottom` for advanced XR rendering. The `stereo_render_data` object provides parameters for standard stereoscopic playback. Finally, the `animations` array allows for complex, keyframed animations of camera properties, enabling effects like orbital pans, zooms, and focus pulls directly within the image file.

```json
{
  "encoder": "5.3.0 (python)",
  "baseline_mm": 45,
  "views": [
    {
      "width_px": 3456,
      "height_px": 2345,
      "focal_px": 1234,
      "frustum_skew": {
        "x": 0.0,
        "y": 0.0
      },
      "position": {
        "x": 0.0,
        "y": 0.0,
        "z": 0.0
      },
      "rotation": {
        "rotation_slant": {
          "x": 0.0,
          "y": 0.0
        },
        "roll_degrees": 0.0
      },
      "lens_focus_inv_z_dist": null,
      "image": {
        "blob_id": -1
      },
      "inv_z_map": {
        "blob_id": 1000001,
        "min": 0.123,
        "max": 0.012,
        "software": "disparity estimator ver 1.2345"
      },
      "layers_top_to_bottom": [
        {
          "width_px": 3456,
          "height_px": 2345,
          "focal_px": 456,
          "software": "ldl generator ver 2.3456",
          "image": {
            "blob_id": -1,
            "outpainting_blob_id": 1000002
          },
          "inv_z_map": {
            "blob_id": 1000001,
            "outpainting_blob_id": 1000003,
            "min": 0.123,
            "max": 0.012,
            "software": "disparity estimator ver 1.2345"
          },
          "mask": {
            "blob_id": 1000004,
            "outpainting_blob_id": 1000005
          }
        }
      ]
    }
  ],
  "stereo_render_data": {
    "baseline": 1.0,
    "inv_convergence_distance": 0.1122,
    "focal_px": 1234,
    "width_px": 3456,
    "height_px": 2345,
    "frustum_skew": {
      "x": 0.0,
      "y": 0.0
    },
    "position": {
      "x": 0.0,
      "y": 0.0,
      "z": 0.0
    },
    "rotation": {
      "rotation_slant": {
        "x": 0.0,
        "y": 0.0
      },
      "roll_degrees": 0.0
    }
  },
  "animations": [
    {
      "type": "harmonic",
      "name": "Animation #1",
      "duration_sec": 10.0,
      "ping_pong_loop": false,
      "data": {
        "baseline": { "amplitude": 0.0, "bias": 1.0 },
        "inv_convergence_distance": { "amplitude": 1.0, "phase": 0.0 },
        "focal_px": { "value": 1234 },
        "width_px": 3456,
        "height_px": 2345,
        "frustum_skew": { "x": { "amplitude": 1.0, "phase": 0.0 }, "y": { "amplitude": 1.0, "phase": 0.0 } },
        "position": { "x": { "amplitude": 1.0, "phase": 0.0 }, "y": { "amplitude": 1.0, "phase": 0.0 }, "z": { "amplitude": 0.5, "phase": 0.0, "bias": 0.5 } },
        "rotation": { "rotation_slant": { "x": { "amplitude": 1.0, "phase": 0.0 }, "y": { "amplitude": 1.0, "phase": 0.0 } }, "roll_degrees": { "amplitude": 1.0, "phase": 0.0 } }
      }
    },
    {
      "type": "keyframes",
      "name": "Animation #2",
      "duration_sec": 10.0,
      "ping_pong_loop": false,
      "data": {
        "baseline": { "interpolation": { "algorithm": "linear" }, "frames": [ { "t_ms": 0.0, "value": 1.0 }, { "t_ms": 5000.0, "value": 2.0 }, { "t_ms": 10000.0, "value": 1.0 } ] },
        "inv_convergence_distance": { "interpolation": { "algorithm": "linear" }, "frames": [ { "t_ms": 0.0, "value": 0.1234 }, { "t_ms": 10000.0, "value": 0.2 } ] },
        "focal_px": { "interpolation": { "algorithm": "quadratic-bezier" }, "frames": [ { "t_ms": 0.0, "value": 1234 }, { "t_ms": 5000.0, "value": 2345 }, { "t_ms": 10000.0, "value": 455 } ] },
        "width_px": 3456,
        "height_px": 2345,
        "frustum_skew": { "interpolation": { "algorithm": "catmull-rom", "params": { "alpha": 0.5 } }, "frames": [ { "t_ms": 0.0, "value": { "x": 0.0, "y": 0.0 } }, { "t_ms": 2500.0, "value": { "x": 0.5, "y": 0.0 } }, { "t_ms": 6700.0, "value": { "x": 0.0, "y": -0.5 } }, { "t_ms": 10000.0, "value": { "x": 0.0, "y": 0.0 } } ] },
        "position": { "interpolation": { "algorithm": "catmull-rom", "params": { "alpha": 0.5 } }, "frames": [ { "t_ms": 0.0, "value": { "x": 0.0, "y": 0.0, "z": 0.0 } }, { "t_ms": 2900.0, "value": { "x": 0.1, "y": 0.0, "z": 0.5 } }, { "t_ms": 3800.0, "value": { "x": 0.0, "y": 0.1, "z": 0.3 } }, { "t_ms": 10000.0, "value": { "x": 0.1, "y": 0.0, "z": 0.0 } } ] },
        "rotation": { "interpolation": { "algorithm": "linear" }, "frames": [ { "t_ms": 0.0, "value": { "rotation_slant": { "x": 0.0, "y": 0.0 }, "roll_degrees": 0.0 } }, { "t_ms": 10000.0, "value": { "rotation_slant": { "x": 0.0, "y": 0.0 }, "roll_degrees": 45.0 } } ] }
      }
    }
  ]
}
```

## Leia Video Format (LVF) Details

### Purpose and Compatibility

The Leia Video Format (LVF) is Leia's standardized format for 3D video content. Its primary purpose is to maximize compatibility between Leia's 3D displays and the wider ecosystem of legacy 2D devices and platforms. LVF supersedes older, less compatible formats such as the "4V videos" used by the Hydrogen One smartphone, creating a unified 3D media experience that aligns with the capabilities of the LIF format for still images.

A core design principle of LVF is ensuring backward compatibility. Videos encoded in LVF can be played on any standard 2D video player or app without issue. This is achieved through a dual-stream architecture that gracefully degrades to a 2D viewing experience on non-Leia devices, preventing the compatibility problems that plagued earlier 3D video formats.

### Technical Structure

The technical implementation of LVF relies on encoding two distinct video streams within a single container.

*   **Dual Video Streams**: An LVF file contains two separate 2D video streams. The first stream is the left-eye view, which is designated as the primary stream. The second stream contains the right-eye view.
*   **Legacy Playback**: Standard 2D video players and applications are programmed to decode only the primary video stream. As a result, when an LVF file is opened on a non-Leia device, only the left-eye stream is played, and the user sees a normal 2D video.
*   **3D Playback**: Leia's proprietary applications and players are designed to detect and decode both streams. By decoding both the left and right views simultaneously, they can reconstruct the stereoscopic 3D video for playback on Leia's light field displays.
*   **Format Standardization**: With the introduction of LVF, Leia has standardized its 3D video capture format. Future Leia devices will no longer support older formats like 2x1 Side-by-Side recording, making LVF the exclusive format for all new 3D video content created within the Leia ecosystem.

### Metadata and Reconvergence

A key feature of LVF is its flexible handling of stereoscopic convergence, which is managed via metadata rather than being hard-coded into the video streams.

*   **Dynamic Convergence**: LVF files are stored without a fixed convergence point. Instead, metadata within the file can specify how convergence should be handled during playback. This can be set to 'auto' for automatic adjustment or to specific manual values.
*   **Keyframed Convergence**: For more granular control, the metadata can store an array of manual convergence values tied to specific keyframes in the video. This allows content creators to dynamically adjust the 3D effect throughout the video for artistic or corrective purposes.
*   **On-the-fly Reconvergence**: Playback applications, such as LeiaPlayer, read this metadata and apply the convergence settings on-the-fly. This dynamic reconvergence ensures an optimal 3D viewing experience tailored to the specific content.
*   **Editing and Adjustment**: LeiaPlayer provides tools for users to edit this metadata. A user can set a single manual convergence value for the entire video or revert the settings back to auto-convergence mode.

## Developer Support and Advanced Features

### SDKs and Open Source
To facilitate the adoption and integration of its media formats, Leia provides robust support for developers. Android and Python Software Development Kits (SDKs) are available for both encoding and decoding LIF files. These SDKs support various input formats, including stereo (2x1), quad (2x2), and legacy Leia photo formats, allowing developers to build applications that can create and consume LIF content. To further encourage development and community involvement, Leia has made relevant libraries and documentation available on GitHub, promoting an open-source approach to working with their formats.

### Advanced Features (LIF 5.0+)
The evolution of the LIF format, particularly from version 5.0 onwards, is focused on capturing a more complete representation of the 3D scene. The next generation of LIF aims to record a comprehensive set of camera intrinsics and extrinsics for each image view. This includes parameters like focal length, principal point, lens distortion, and the precise 3D position and orientation of the camera for each view. By storing this rich data, the format facilitates the process of generating arbitrary new viewpoints within the camera space described by the file. This capability is a critical enabler for advanced XR and AR applications, where the user's perspective is dynamic and requires the rendering of novel views in real-time.
