---
id: lif
title: Leia Image Format (LIF) and Leia Video Format (LVF)
type: other
personas: [david]
summary: A technical overview of the Leia Image Format (LIF) and Leia Video Format (LVF), detailing their structure, purpose, creation, and consumption for immersive 3D content.
---

**Key Terms**: LIF, LVF, Disparity Map, Depth Layers, View Synthesis, XR, Extended Reality, LeiaSR, Immersity AI, Convergence, Keyframes, Camera Intrinsics, Camera Extrinsics
**Also Known As**: Leia Image Format, Leia Video Format, 4V videos

## Leia Image Format (LIF)

### Purpose and Overview

The Leia Image Format (LIF) is a specialized container format engineered to capture, create, and deliver immersive 3D imagery across a wide range of platforms and devices. Its core function is to store multiple viewpoints of a scene, with each viewpoint being accompanied by a high-quality disparity map. This combination is crucial for generating a complete and interactive 3D image experience.

LIF files are designed to be deconstructed into distinct depth layers. Each layer contains both an RGB texture and its corresponding disparity map, a structure that is fundamental to the view synthesis process. This makes LIF particularly well-suited for applications demanding depth-rich visuals, such as in Extended Reality (XR) environments. The format is versatile, supporting rendering in standard 2D, 3D stereoscopic, and fully interactive 3D modes.

### Technical Structure

The architecture of a LIF file is built to support rich 3D data and interactivity.

- **Multi-view Support**: A LIF container can store one, two, or potentially more viewpoints of a single scene, providing the foundational data for 3D reconstruction.
- **Disparity Maps**: Every view stored within a LIF file is paired with a high-quality disparity (or depth) map, which encodes the depth information for each pixel.
- **Layered Depth**: The views can be further decomposed into distinct depth layers. Each of these layers holds its own RGB texture and disparity map, enabling advanced view synthesis techniques required for XR and AR applications.
- **Data Completeness**: A strict requirement of the format is that every view and every layer must contain both an RGB texture and an associated disparity map to be considered valid.

### Creation and Processing

LIF files can be generated from a variety of sources, each with its own workflow.

- **Sources**: The primary methods for creating LIF files include using Immersity AI (available on web and mobile), the Immersity SDK (for Windows and Android), the Leia Camera SDK, and converting from third-party stereoscopic images (such as Left-Right or Side-by-Side formats).
- **Processing**: Depending on the input source, additional processing steps may be necessary. These steps often involve generating new disparity maps, refining existing ones, or decomposing the views into the required depth layers to create a complete LIF file.

### Consumption and Compatibility

The utility of LIF files extends across various platforms and viewing modes.

- **Platforms**: LIF images are designed for broad compatibility, allowing them to be rendered in 2D, 2D interactive, 3D stereo, and 3D interactive (XR) modes. This support spans web browsers, LeiaSR devices, and dedicated XR hardware.
- **Messaging and Metadata**: When sharing LIF files, metadata preservation is key. Platforms like Email and Discord typically preserve the necessary metadata for 3D display. However, many other messaging apps may strip this data, rendering the image as a standard 2D file unless it is compressed in a zip archive.
- **Versioning**: Older versions of the format (specifically, below version 5.3) may not be fully recognized by all applications and could be defaulted to a 2D display.

### Developer Support

To facilitate the adoption and use of LIF, Leia provides resources for developers.

- **SDKs**: Both Android and Python SDKs are available for encoding and decoding LIF files. These SDKs support various input formats, including stereo (2x1), quad (2x2), and legacy Leia photo formats.
- **Open Source**: Key libraries, tools, and documentation are made available to the public on GitHub to encourage development and integration.

### Advanced Features (LIF 5.0 and beyond)

The next generation of the LIF format aims to significantly enhance its capabilities. The goal is to record a complete set of camera intrinsics and extrinsics for each image view. This detailed camera data will facilitate the process of generating arbitrary new viewpoints within the camera space described by the file, enabling more dynamic and immersive XR experiences.

### LIF 5.3 Specification (JSON)

The following JSON structure represents the metadata contained within a LIF 5.3 file, detailing camera parameters, view configurations, layer information, and animation data.

```json
{
  "encoder": "5.3.0 (python)",
  "baseline_mm": 45,
  "views": [
    {
      "width_px": 3456,
      "height_px": 2345,
      "focal_px": 1234,
      "frustum_skew": { "x": 0.0, "y": 0.0 },
      "position": { "x": 0.0, "y": 0.0, "z": 0.0 },
      "rotation": {
        "rotation_slant": { "x": 0.0, "y": 0.0 },
        "roll_degrees": 0.0
      },
      "lens_focus_inv_z_dist": null,
      "image": { "blob_id": -1 },
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
          "image": { "blob_id": -1, "outpainting_blob_id": 1000002 },
          "inv_z_map": {
            "blob_id": 1000001,
            "outpainting_blob_id": 1000003,
            "min": 0.123,
            "max": 0.012,
            "software": "disparity estimator ver 1.2345"
          },
          "mask": { "blob_id": 1000004, "outpainting_blob_id": 1000005 }
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
    "frustum_skew": { "x": 0.0, "y": 0.0 },
    "position": { "x": 0.0, "y": 0.0, "z": 0.0 },
    "rotation": {
      "rotation_slant": { "x": 0.0, "y": 0.0 },
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
        "frustum_skew": {
          "x": { "amplitude": 1.0, "phase": 0.0 },
          "y": { "amplitude": 1.0, "phase": 0.0 }
        },
        "position": {
          "x": { "amplitude": 1.0, "phase": 0.0 },
          "y": { "amplitude": 1.0, "phase": 0.0 },
          "z": { "amplitude": 0.5, "phase": 0.0, "bias": 0.5 }
        },
        "rotation": {
          "rotation_slant": {
            "x": { "amplitude": 1.0, "phase": 0.0 },
            "y": { "amplitude": 1.0, "phase": 0.0 }
          },
          "roll_degrees": { "amplitude": 1.0, "phase": 0.0 }
        }
      }
    },
    {
      "type": "keyframes",
      "name": "Animation #2",
      "duration_sec": 10.0,
      "ping_pong_loop": false,
      "data": {
        "baseline": {
          "interpolation": { "algorithm": "linear" },
          "frames": [
            { "t_ms": 0.0, "value": 1.0 },
            { "t_ms": 5000.0, "value": 2.0 },
            { "t_ms": 10000.0, "value": 1.0 }
          ]
        },
        "inv_convergence_distance": {
          "interpolation": { "algorithm": "linear" },
          "frames": [
            { "t_ms": 0.0, "value": 0.1234 },
            { "t_ms": 10000.0, "value": 0.2 }
          ]
        },
        "focal_px": {
          "interpolation": { "algorithm": "quadratic-bezier" },
          "frames": [
            { "t_ms": 0.0, "value": 1234 },
            { "t_ms": 5000.0, "value": 2345 },
            { "t_ms": 10000.0, "value": 455 }
          ]
        },
        "width_px": 3456,
        "height_px": 2345,
        "frustum_skew": {
          "interpolation": { "algorithm": "catmull-rom", "params": { "alpha": 0.5 } },
          "frames": [
            { "t_ms": 0.0, "value": { "x": 0.0, "y": 0.0 } },
            { "t_ms": 2500.0, "value": { "x": 0.5, "y": 0.0 } },
            { "t_ms": 6700.0, "value": { "x": 0.0, "y": -0.5 } },
            { "t_ms": 10000.0, "value": { "x": 0.0, "y": 0.0 } }
          ]
        },
        "position": {
          "interpolation": { "algorithm": "catmull-rom", "params": { "alpha": 0.5 } },
          "frames": [
            { "t_ms": 0.0, "value": { "x": 0.0, "y": 0.0, "z": 0.0 } },
            { "t_ms": 2900.0, "value": { "x": 0.1, "y": 0.0, "z": 0.5 } },
            { "t_ms": 3800.0, "value": { "x": 0.0, "y": 0.1, "z": 0.3 } },
            { "t_ms": 10000.0, "value": { "x": 0.1, "y": 0.0, "z": 0.0 } }
          ]
        },
        "rotation": {
          "interpolation": { "algorithm": "linear" },
          "frames": [
            {
              "t_ms": 0.0,
              "value": {
                "rotation_slant": { "x": 0.0, "y": 0.0 },
                "roll_degrees": 0.0
              }
            },
            {
              "t_ms": 10000.0,
              "value": {
                "rotation_slant": { "x": 0.0, "y": 0.0 },
                "roll_degrees": 45.0
              }
            }
          ]
        }
      }
    }
  ]
}
```

## Leia Video Format (LVF)

### Purpose and Overview

The Leia Video Format (LVF) is Leia's proprietary format for 3D video content. It was developed to maximize compatibility between modern Leia 3D displays and legacy 2D devices. This format supersedes older, less standardized formats like the "4V videos" from the Hydrogen One project, aiming to create a consistent 3D video experience that aligns with the capabilities of the LIF format for still images.

### Technical Structure

LVF employs a clever dual-stream approach to maintain backward compatibility while enabling 3D playback.

- **Dual Streams**: An LVF file encodes two separate video streams within a single container. The primary stream is a standard 2D video (the left-eye view), which is accessible to any standard video player. The secondary stream contains the right-eye view, which is utilized by Leia-specific applications to reconstruct the 3D video.
- **Legacy Compatibility**: When an LVF file is opened in a standard 2D application, the player decodes only the primary (left) stream, allowing the video to be viewed in 2D without errors. Leia-enabled apps, however, decode both streams simultaneously to deliver the full 3D effect.
- **End of 2x1 Format**: Moving forward, Leia devices will no longer support the 2x1 (Side-by-Side) recording format. LVF is now the exclusive and standard format for all 3D video capture on the platform.

### Metadata and Reconvergence

A key feature of LVF is its flexible handling of 3D convergence, which is managed through metadata rather than being hard-coded into the video streams.

- **Convergence Handling**: LVF files are stored without a fixed convergence point. The convergence can be set dynamically during playback using metadata. This metadata can either specify 'auto' convergence, allowing the player to determine the best setting, or provide manual convergence values. For more precise control, the metadata can also store an array of manual values tied to specific keyframes in the video.
- **On-the-fly Reconvergence**: Playback applications like LeiaPlayer use this metadata to reconverge the video streams on-the-fly, ensuring an optimal 3D experience tailored to the content and display.
- **Editing**: The LeiaPlayer application provides tools for users to adjust convergence settings. Users can set a manual convergence point for an entire LVF file or revert to the default auto-convergence mode.
