---
title: Phase Engineering in 3D Displays
docType: note
url: RAG-RAW-DOCS/Notes/phase_eng.md
scraped_at: 2025-09-26T19:02:02.228Z
word_count: 913
extraction_quality: high
updated_at: 2025-09-26T19:02:02.228Z
---

# Phase Engineering in 3D Displays

## 1. Introduction to Phase Engineering

Phase engineering in 3D displays primarily concerns the precise alignment and interaction between the 2D display sub-pixels and the 3D optical layer. The "phase" refers to a function that assigns a value (typically between 0 and 1) to each subpixel on the display, influencing how light propagates from the pixel to the observer's eye. This intricate relationship is crucial for generating a coherent 3D experience, and deviations in phase can lead to visual artifacts and reduced 3D quality.

## 2. Physical Display Model

A physical model is employed to predict the optical phase experienced by a viewer at a specific location (x, y, z) when looking at a particular pixel (x₀, y₀) on the display. All variables are expressed in physical space (mm).

### Optical Layer Description

The optical layer is characterized by a repeating structure with a horizontal pitch (pₓ) and a slant angle (sl), which represents the tangent of the optics angle from the vertical direction. The phase function, ϕ(x₁, y₁), describes the optical behavior at various locations on the display, where x₁ and y₁ are the projections of the pixel (x₀, y₀) onto the optical layer. A phase value of 0 or 1 indicates the boundary of an optical structure, while 0.5 signifies the center.

The phase function is given by:
ϕ(x₁, y₁) = ϕc + (x₁ + sl ⋅ y₁) / pₓ

where ϕc is the center phase.

### Projection from Display to Optical Layer

The projection from the display to the optical layer is modeled using a simple refraction model. The space between the display and the optical element is filled with a medium of refractive index 'n', separated by a distance 'd'. Once the light ray exits the optical element, it propagates in free space (index 1) to the observation point.

For an optical overlay (Leia Gen 3), the projection is approximated by:
x₁ = x₀ + q ⋅ (x - x₀)
y₁ = y₀ + q ⋅ (y - y₀)
where q = (d/n) / √(z² + (1 - 1/n²) ⋅ ((x - x₀)² + (y - y₀)²))

For an optical underlay (Leia Gen 2), the projection is given by:
x₁ = x₀ - q ⋅ (x - x₀)
y₁ = y₀ - q ⋅ (y - y₀)
where q = (d/n) / √(z² + (1 - 1/n²) ⋅ ((x - x₀)² + (y - y₀)²))

## 3. Calibration Methods

Calibration is essential to correct for manufacturing variations and ensure optimal 3D performance.

### Phase Correction

Phase correction aims to compensate for deviations from an ideal alignment. An ideal reference device has its optical layer directly on the display plane (d=0) with ideal alignment (ϕc=0). A regular device will have its optical layer at a distance 'd', with an optical pitch pₓ/(1+s) (overlay) or pₓ(1+s) (underlay), and a slant sl-θ, and a center phase ϕc.

A pattern is displayed to measure the uncorrected phase, and the display signal is observed from various (x,y,z) locations to assess the difference between the device phase and the reference phase, known as "phase correction" (Δϕ).

For the overlay case:
Δϕov = ϕc + (1+s)(x₁ + (sl-θ)y₁) / pₓ - (x₀ + sl⋅y₀) / pₓ
Δϕov = ϕc + q/pₓ ⋅ (x + sl⋅y) + (s-q) ⋅ (x₀ + sl⋅y₀) / pₓ - θ⋅y₀ / pₓ

For the underlay case:
Δϕun = ϕc + (x₁ + (sl-θ)y₁) / ((1+s)pₓ) - (x₀ + sl⋅y₀) / pₓ
Δϕun = ϕc - q/pₓ ⋅ (x + sl⋅y) - (s-q) ⋅ (x₀ + sl⋅y₀) / pₓ - θ⋅y₀ / pₓ

## 4. Interlacing / Weaving

The interlacing algorithm determines which content (or view) to display on a given sub-pixel (x₀, y₀) based on the head location (x, y, z). Once the projected coordinates (x₁, y₁) on the optical layer are known, the sub-pixel is associated with a phase ϕ(x₁, y₁).

For N views, indexed by k=0..N-1, the sub-pixel is painted with view N-1-k when k/N < ϕ(x₁, y₁) < (k+1)/N. Blending is often applied at view boundaries to avoid visible transition artifacts.

The interlacing process in code involves:
1.  Computing screen coordinates (x₀, y₀).
2.  Computing the projection onto the optical element (x₁, y₁).
3.  Computing the phase for RGB channels.
4.  Applying anti-crosstalk (ACT) by subtracting a small portion of the other view.
5.  Applying the calculated phase with maximum separation for each texture, sampling the ACT texture according to the phase value, possibly with blending at view boundaries.

## 5. Phase Tolerances

Phase tolerances are critical for the quality of the 3D experience. Errors in calibration or tracking can significantly impact the perceived 3D effect. The entire 3D experience is determined by the phase equation, and understanding the acceptable range of phase deviations is crucial for maintaining visual quality.

## 6. Key Parameters

The key parameters involved in phase engineering and calibration include:
*   **pₓ (horizontal pitch):** The repeating structure's horizontal pitch on the optical layer.
*   **sl (slant angle):** The tangent of the optics angle from the vertical direction.
*   **d (distance):** The distance between the display and the optical element.
*   **n (refractive index):** The refractive index of the medium between the display and the optical element.
*   **s (stretch):** A parameter related to the optical pitch, indicating stretch or compression.
*   **θ (angular correction):** A parameter related to the slant angle, indicating angular correction.
*   **ϕc (center phase):** The phase at the center of the optical structure.
