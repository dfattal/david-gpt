---
title: 'The Spatial Shift #1 | The Rise of Spatial Content: A New Norm in Digital Experiences'
docType: Blog
url: 'https://www.linkedin.com/pulse/rise-spatial-content-new-norm-digital-experiences-david-fattal-ht32c'
scraped_at: '2025-09-26T06:10:00.000Z'
word_count: 632
extraction_quality: high
outlet: 'The Spatial Shift'
published_date: '2025-06-13T10:00:00.000Z'
authors:
  - name: David Fattal
    affiliation: Leia Inc
---

# The Spatial Shift #1 | The Rise of Spatial Content: A New Norm in Digital Experiences

This week’s Apple Developer Conference reinforced what many industry observers have anticipated: spatial content is becoming the new standard for digital interaction. With announcements surrounding iOS 26 and visionOS 2.6, Apple showcased enhanced capabilities for transforming traditional 2D photos into immersive, three-dimensional experiences. Users can now effortlessly transform their existing image libraries into dynamic spatial scenes, enabling richer storytelling and deeper emotional engagement.
Apple’s move validates what’s been clear to many in this field: spatial content is rapidly moving into mainstream expectations. The conversion of 2D content into immersive spatial scenes is an inevitable evolution in how users interact with digital media. Traditional flat images are becoming gateways into vivid, immersive worlds, significantly enhancing user engagement. Advances in AI and computer vision are powering this shift, enabling the reconstruction of 3D geometry from a single 2D photo. These systems estimate depth (or more accurately, disparity), layer the scene, and generate new viewpoints — all with increasing realism. Importantly, these AI-driven conversions no longer require heavy server-side compute alone. Modern mobile SoCs — equipped with neural engines and dedicated DSPs — can now perform depth estimation and rendering in real-time directly on-device.
For a viewer it is key that the quality of the conversion feels natural and is not disturbed with strange artifacts. The technical core of 2D-to-3D conversion starts with the quality of the depth estimation itself. Many monocular depth models have historically been trained on synthetic datasets—generating 3D scenes in rendering engines along with perfect depth maps. But synthetic data alone often misses the nuances of real-world optics: specular highlights, transparent objects, lighting variations, or reflective surfaces.
To achieve a conversion that feels natural, multi-view data becomes critical. True stereo or multiview captures — such as those from modern smartphones with multiple cameras, dedicated stereo devices like Leia’s Lume Pad, or headsets like Vision Pro — provide essential training signals that help models better handle these complex real-world effects. At Leia, our Neural Depth Engine has been trained on a mix of synthetic and real-world stereo imagery.[^1]

![AI-generated depth from 2D images across models](https://cdn.gamma.app/cgprmwex6zwhbfo/fd3cf40f56da41b2a5f100a2fbf74326/original/1749842818656.png)
AI-generated depth from 2D images across models (left to right: Bytance DA1, DA2, Apple Depth Pro, Leia Neural Depth Engine). Training with real stereo improves handling of reflections and transparencies.

But technical challenges don’t stop at raw depth: proper depth calibration is critical to ensure natural viewing comfort. Not every image should “pop” equally. A distant background should remain flat and gently recessed, while objects extending toward the viewer — a child reaching their hand to the camera, for example — should have the right amount of parallax to feel natural. Algorithms that manage depth positioning inside the viewport — like those we’ve developed at Leia — play a key role in ensuring comfort across both mobile displays and XR headsets.
Finally, there’s the question of de-occlusions: when shifting viewpoints, previously hidden parts of the scene must be infilled. While many pipelines (including Apple’s) rely on simple blurring, more advanced generative AI techniques can convincingly outpaint those missing areas, resulting in far more visually pleasing and coherent results.

![Naive vs. Generative AI inpainting for de-occluded regions](https://cdn.gamma.app/cgprmwex6zwhbfo/936abf679b7346cd9944232558e2c963/original/1749843391817.png)
Left: Naive inpainting for de-occluded regions. Right: Generative AI inpainting yields more realistic reconstruction.

Our web app, app.immersity.ai combines all these elements and with our latest Immersity 4.0 model, you can convert any media into immersive experiences that can be enjoyed on any (flat) screen or immersive hardware. There are dedicated immersive devices that have a stereo view such as the Meta Quest or the Vision Pro, yet we expect in future to see immersive stereo views directly on personal devices, such as our Lume Pad 2, or the Acer SpatialLabs monitors.
Ultimately, the question isn’t whether spatial media will be universally adopted—it’s how quickly developers, device makers, and platforms will move to leverage proven, accessible solutions. The shift towards immersive digital experiences is well underway, and those equipped with advanced, ready-to-deploy technology will inevitably lead this new wave.

[^1]: Part of Leia's dataset was shared with the community via Holopix50k.