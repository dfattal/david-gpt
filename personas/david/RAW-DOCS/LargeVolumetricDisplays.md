# Assessment of Volumetric Free-Space 3D Display Approaches

-Author: David Fattal
-Date: October 02, 2025

## 1. Scope and vision context

The Client envisions a large-scale free-space volumetric display to fill an architectural atrium (vertical ≈350 m, horizontal ≈90 m) with interstitial 3D images. Observers should see the images from almost any direction without head-mounted displays, and the display must avoid the “clipping” that limits conventional holographic and light-field displays. After reviewing early concepts, the Client asked for a realistic assessment of volumetric techniques—particularly displays that create light in air rather than on a surface—and guidance on promising research paths and potential partners.

This assessment therefore **excludes screen-based light-field and computer-generated holographic approaches**. Those technologies modulate light at a two-dimensional surface, which inevitably produces edge boundaries that clip the 3D volume; a seminar on free-space displays notes that clipping restricts the utility of **holographic, nanophotonic and lenslet displays** and any system where the light-scattering surface and image point are physically separate [1]. Instead we focus on **volumetric methods that generate light at the image point itself**, specifically:

*   **Ionization or plasma voxels**, where short, high-intensity laser pulses ionise air or another medium to produce a glowing point.
*   **Optical-trap displays (OTDs)**, which use a trapping beam to levitate and move a microparticle while illuminating it with visible lasers to draw an image through persistence of vision.

Both techniques require breakthroughs in laser power, beam steering and computation. We compare them below and recommend directions for research and collaboration.

## 2. Why lightfield and holographic displays are unsuitable for full-field volumetric experiences

Light-field and holographic displays create 3D images by modulating amplitude and phase across a two-dimensional aperture. While these technologies deliver impressive glasses-free 3D at smaller scales, they suffer from fundamental limitations when scaled to immersive environments:

*   **Edge clipping and limited field of view**. Because the light is modulated at a planar surface, rays emanate from a finite aperture. Viewers outside this cone cannot see the image. The free-space volumetric display community notes that clipping restricts all 3D displays that modulate light at a 2D surface—including holographic displays and nanophotonic arrays—and free-space OTDs were conceived specifically to avoid this limitation [1].
*   **Direction-dependent resolution**. Light-field displays trade spatial resolution for angular resolution; achieving a 180° or 360° field of view would require an impractically large number of directional samples and enormous light throughput. Holographic displays can in principle produce wide viewing zones, but maintaining high diffraction efficiency over hundreds of degrees would require a metre-scale holographic modulator with sub-micrometre pixels and multi-gigahertz update rates.
*   **Bandwidth and computational burden**. A volumetric light-field display with 1024×768 spatial samples and 1024 depth layers would need roughly **135 GB/s** to update at 60 volumes per second [2]; a full 360° field of view with billions of voxels would raise this by orders of magnitude. Real-time holography demands similarly high bandwidth and heavy numerical computation.

With **20 years of experience designing light-field (ray) and holographic (wave) displays**, we have seen how these technologies excel in **personal devices**—from smartphones and tablets to televisions—where only a single user or a small group views the image. Scaling such displays requires **tracking the viewer's eyes** so that a **narrow view cone** can be directed toward them [3, 4]. Such solutions effectively restrict current light-field and holographic systems to **single-viewer or few-viewer scenarios** with narrow viewing cones. These constraints, along with the clipping and bandwidth limits above, make light-field and holographic approaches unsuitable for the Client's **large-scale, multi-viewer volumetric experience**.

Because of these constraints, screen-based light-field and holographic methods cannot deliver the 360° free-space experience the Client desires. The remainder of this report focuses on volumetric techniques where the light source and image point coincide.

## 3. Ionisation (plasma) volumetric displays

In **femtosecond-laser volumetric displays**, a tightly focused femtosecond pulse ionises air or another medium, creating a glowing plasma voxel. Computer-generated holograms (CGHs) or scanning optics are used to position the focal spot. Recent demonstrations have produced multicolour voxels by separating the drawing space from the viewing space and using liquid-crystal colour filters to extract different colours from broadband emission [5]. While this separation allows colour tuning, the technology still faces significant limitations:

*   **Limited colour and brightness**. Femtosecond-laser-excited voxels naturally emit a **bluish-white monochromatic light**, so colourisation requires additional optics [5]. Even with colour extraction, the brightness of plasma voxels decays rapidly with distance. Achieving visible voxels across tens of metres would necessitate extremely high pulse energies, raising eye-safety concerns.
*   **Restricted volume and voxel count**. Voxel generation requires high peak intensity, so the **size of the graphics and number of voxels are restricted**; early systems produced graphics only a few millimetres across because a short-focal-length lens was needed to create high energy density [5]. Increasing the display size either reduces brightness or demands a medium (e.g., xenon gas) with lower ionisation threshold, which introduces a physical barrier and reduces interactivity [5].
*   **Pulse repetition and scanning speed**. To form a persistent image, a plasma voxel must be refreshed faster than the human eye's integration time. Generating thousands of voxels at video frame rates would require a femtosecond laser with high repetition rate and high average power, which are costly and bulky.
*   **Safety and acoustic issues**. Ionisation pulses produce audible “pops” as plasma forms, and the high intensities pose skin and eye hazards. Building a safe, comfortable viewing environment is non-trivial.

**Assessment**: Ionisation-based displays demonstrate captivating mid-air pixels but remain confined to **millimetre- to centimetre-scale volumes**. The need for high peak power, limited colour output and safety concerns make scaling to tens of metres unrealistic at this time. Research into re-projection methods, alternative gases and lower-power plasma generation could improve the technology, but the current trajectory does not meet the Client's requirements.

## 4. Optical-trap displays (OTDs)

Optical-trap displays manipulate a scattering particle with a “trapping” laser and illuminate it with red, green and blue light as it moves, using **persistence of vision** to trace 3D images. This technique, pioneered at Brigham Young University (BYU), offers several advantages over ionisation and holography:

*   **No clipping and constant resolution**. Because the image point itself emits or scatters light, OTDs can produce graphics visible from almost any direction and are not subject to the edge clipping that limits holographic and light-field displays [1]. Resolution remains constant throughout the volume.
*   **Lower bandwidth for sparse scenes**. The bandwidth of an optical-trap display scales with the **number of particles**, not the total volume. The OTD community notes that this can result in orders-of-magnitude lower bandwidth than holography for sparse images [6], making real-time rendering more tractable.
*   **Demonstrated colour images**. BYU's early prototypes used a single trap and produced **1 cm vector images** that were refreshed at **>10 frames per second** [6]. Recent systems employ one violet (405 nm) beam for trapping and separate red, green and blue lasers for illumination; full-colour vector images can now be drawn at video rates [6]. The intensities of these beams in the 2019 prototype were ~80 mW for the trap and 24–31 mW for each RGB primary [6].
*   **Scalability through multi-particle trapping**. The next step is to trap and scan **multiple particles** simultaneously. Researchers propose using diffractive gratings or static metasurfaces to split a trapping beam into an array of identical traps, each holding a particle [6]. This approach simplifies scanning by moving many particles along a simple trajectory while individually modulating their illumination. Estimates suggest that **millions of particles** could be controlled with current **spatial-light-modulator (SLM) products** [6], with total bandwidth remaining within the hundreds of millions of pixels per second that commodity GPUs can handle [6].
*   **Clear development roadmap**. The 2019 “Improving photophoretic trap displays" paper outlines targeted improvements: better trapping (uniform coated microspheres and alternative trap designs), faster scanning (solid-state scanning such as acousto-optic or electro-optic deflectors) and multi-particle scaling [6]. The authors' near-term goal is a **20 cm-tall, full-colour image** with multiple particles moving along simple paths [6].

### Photophoretic trapping fundamentals

To appreciate why OTDs are attractive, it is important to distinguish between **photophoretic trapping** and traditional **optical tweezing**. Optical tweezers use the gradient force from a tightly focused laser to pull transparent particles toward the intensity maximum; this typically requires **≈1 W of laser power** focused to a spot of tens of micrometres [7]. Photophoretic traps operate on a different principle: they rely on **light-induced temperature gradients**. When an absorbing particle is illuminated, the side facing the beam heats more than the shaded side. Ambient gas molecules colliding with the hot side rebound with greater momentum than those colliding with the cooler side, giving the particle a **net push away from the illumination** [8]. This **photophoretic force** can be several orders of magnitude stronger than radiation pressure [8], meaning that **tens of milliwatts** of optical power are sufficient to levitate micron-scale particles [6].

In practice, photophoretic traps are created by shaping the trapping beam into a **hollow or vortex profile**. Absorbing particles enter this structured light field and are driven toward regions where the heating is symmetric. A study on photophoretic manipulation notes that constructing a **hollow light field with high intensity** can confine absorbing droplets and that balancing axial force components allows stable levitation [9]. BYU's OTD prototypes use a near-UV (405 nm) trapping beam of about **80 mW**, together with separate red, green and blue lasers of roughly 25–31 mW for illumination [6]. The trap moves the particle through the drawing volume while the RGB beams modulate its brightness and colour.

Photophoresis operates effectively in **ambient air** and does not require immersion in water, allowing volumetric displays to be formed in open spaces. The force is sensitive to pressure: in the **free-molecular regime** (very low pressure), gas molecules rarely collide with each other and the photophoretic force scales differently than in the **continuum regime** (normal air). For our purposes the continuum regime is relevant; here, photophoretic traps can levitate absorbing particles ranging from a few micrometres to millimetres in diameter [8]. Because the trapping force arises from thermal gradients rather than momentum, photophoretic traps can handle **larger particles**, support operation in air, and separate trapping and illumination wavelengths [6]. These characteristics enable **safer, lower-power operation** compared with ionisation-based voxels and optical tweezers, which require peak powers of kilowatts or average powers of watts respectively [7].

### Challenges and limitations:

*   **Particle control and robustness**. Current traps sometimes hold particles for only a few seconds, while others remain stable for hours [6]. Achieving repeatable traps requires developing uniform particle populations and more consistent trapping potentials [6]. Environmental disturbances such as airflow or user interaction can dislodge particles; automated pickup and replacement from a reservoir may be needed [6].
*   **Scaling to metres**. The OTD prototypes to date are centimetre scale. Scaling up requires increasing trap strength and scan length without losing particle confinement. Optical forces decrease quickly with distance, so scanning over metres will demand higher laser power or alternative trapping methods (e.g., photophoretic traps with shaped beams or acoustic trapping). Even the optimistic 20 cm target remains far from the **Client's desired 30–100 m scale**.
*   **Beam steering and per-particle modulation**. To modulate millions of particles in parallel, the system must deliver independent RGB illumination to each trap at video rates. This implies **SLM or optical phased-array technology with ~0.5 μm pixel pitch and ≥120 Hz refresh**, far beyond today's commercial SLMs. Fast acousto-optic deflectors can steer beams in microseconds, but their deflection range and power handling may be limiting [6].
*   **Safety and maintenance**. Trapping beams must be near-UV or infrared to avoid visible stray light; they still introduce laser safety constraints. Particles will accumulate dust, requiring periodic replacement or cleaning. The system must be shielded to prevent user exposure to lasers.

**Assessment**: OTDs are an **active research area** with a clear roadmap. They offer true volumetric images without clipping and can, in principle, scale by increasing the number of particles and using sophisticated beam-steering. The technology is not yet close to the **Client's desired 30-100 m scale**, but incremental progress towards **20–50 cm volumes** appears achievable. Multi-particle trapping, improved trap designs and solid-state scanning are the most promising avenues.

## 5. Comparison of ionisation vs optical-trap approaches

| Criterion | Ionisation (plasma voxels) | Optical-trap displays (OTDs) |
| :--- | :--- | :--- |
| **Voxel generation** | Femtosecond laser pulses ionise air or gas; voxels emit bluish-white light and require high peak intensity [5]. | Micron-scale particle is trapped and moved; visible lasers illuminate it to produce RGB colours [6]. |
| **Colour capability** | Native emission is monochromatic; colour requires separation and re-projection and remains challenging [5]. | Full colour achieved by combining red, green and blue illumination on the moving particle [6]. |
| **Current scale** | Demonstrations produce graphics only a few millimetres to centimetres; voxel count limited by pulse energy [5]. | Prototypes produce vector graphics ~1 cm tall and aim for 20 cm volumes with multi-particle scaling [6]. |
| **Bandwidth & computation** | Each voxel requires a separate femtosecond pulse; scaling to millions of voxels at video rates demands extremely high repetition rates and data throughput. | Bandwidth scales with number of particles; a one-million-particle system may be feasible with hundreds of millions of pixels per second [6]. |
| **Safety & environmental impact** | High intensities pose eye and skin hazards; pulses create audible noise; requires controlled environment. | Trap lasers operate near UV or IR; still require laser safety but lower hazard levels; particle replenishment needed to maintain cleanliness [6]. |
| **Scalability path** | Larger volumes require lower ionisation threshold media (gas cells) or stronger pulses; both reduce interactivity and add complexity [5]. | Scaling via diffractive beam splitting and multi-particle trapping; solid-state beam steering could enable millions of voxels [6]. |

**Our Recommendation**: Given the current state of the art, **optical-trap displays are a more promising path** to free-space volumetric images than ionisation. OTDs already demonstrate full-colour voxels and have a clear strategy for scaling via parallel trapping and improved scanning. Ionisation displays remain limited by high pulse energies, monochromatic emission and safety issues.

## 6. Breakthroughs required to realize the Client's vision

Achieving **30–100 m volumetric displays** will require advances across multiple fields. Below are realistic targets rather than speculative orders of magnitude:

### 6.1 Laser and optics technology

*   **Trapping and illumination lasers**: For OTDs, trap beams around 405 nm with intensities of tens of milliwatts [6] must be scaled to maintain trapping forces over metre distances. This may involve using higher-power continuous-wave lasers, beam-shaping optics or photophoretic traps that operate efficiently at longer wavelengths.
*   **Parallel beam generation**: Implement diffractive optical elements or **optical phased arrays** that can split a single laser into **thousands of independently controllable beams** with **~0.5 µm pitch and ≥120 Hz refresh rates**. Silicon photonic OPAs currently steer over tens of degrees but have limited apertures; emerging metasurface arrays can achieve 120° steering with microsecond response [10].
*   **Acousto-optic or electro-optic scanning**: Replace galvanometric mirrors with acousto-optic deflectors or electro-optic prisms to achieve microsecond beam steering without moving parts [6]. These devices will need large apertures and high power handling to service wide viewing volumes.

### 6.2 Scattering physics and particle control

*   **Uniform scattering particles**: Develop coated microspheres or engineered microparticles with consistent size, shape and optical properties to improve trap reliability [6].
*   **Photophoretic trap design**: Investigate alternative trapping mechanisms—such as holographic traps, phase-contrast traps or acoustic traps—to maintain particle confinement over longer paths [6]. Photophoretic traps rely on absorbing particles; exploring dielectric particles or acoustic levitation may extend range and reduce absorption.
*   **Multi-particle coordination**: Design control schemes and feedback systems to synchronise the motion of thousands of particles through simple trajectories while modulating their illumination independently. Machine-learning-based controllers could optimise trajectories and correct drift in real time.

### 6.3 Computation and bandwidth

*   **Wavefront generation hardware**: Develop SLMs or OPAs with **sub-micrometre pixels and >120 Hz update rates** to deliver per-particle RGB modulation. Current commercial LCOS SLMs operate at tens of kilohertz; achieving 120 Hz for millions of beams will require new materials such as ferroelectric liquid crystals or thin-film lithium niobate modulators.
*   **Real-time control systems**: Integrate **FPGA/ASIC front-ends** to compute beam-splitting patterns and particle trajectories. A one-million-particle display would require processing hundreds of millions of pixel updates per second [6]; this is within the capability of modern GPUs, but custom architectures will be needed for low latency.
*   **Data compression and content creation**: Use sparse representations and predictive coding to minimise bandwidth. ML techniques could generate high-level trajectory commands rather than per-voxel commands, reducing data rates.

### 6.4 Safety and user experience

*   **Eye-safe operation**: Develop interlock systems and optical enclosures to meet IEC 60825-1 laser safety standards. Use wavelengths that are less hazardous (e.g., 1.5 µm) where possible, though this may reduce trap strength.
*   **Environmental robustness**: Design enclosures or laminar airflow systems to stabilise the image against air currents. Build automatic particle replenishment to maintain image continuity [6].
*   **Perceptual considerations**: Manage vergence-accommodation cues and motion parallax to reduce visual discomfort. The display should support near-real-time refresh (>120 Hz) to avoid flicker.

## 7. Potential partners and research directions

*   **Academic collaborations**: The **BYU Holography Lab**, led by Daniel Smalley, is the pioneer in optical-trap displays and is actively exploring multi-particle scaling [6]. Engaging with this group could provide access to expertise in photophoretic traps, scanning architectures and particle design. Additional partners include researchers at the University of Tsukuba and Osaka University who work on femtosecond-laser volumetric displays and colour extraction [5].
*   **Beam-steering companies**: Start-ups developing **metasurface beam-steering** (e.g., Lumotive, a spin-out of Intellectual Ventures) or **silicon photonic OPAs** could supply high-density beam-splitting hardware. Collaboration could involve tailoring OPAs for trap beam splitting and RGB illumination.
*   **Laser manufacturers**: Firms such as **Coherent, IPG Photonics** and **NKT Photonics** produce high-power, short-pulse lasers. Partnerships could focus on developing eye-safe, high-repetition-rate sources for trapping and illumination.
*   **Optical component suppliers**: Companies like **Thorlabs, Hamamatsu** and **Texas Instruments** (for DMDs or LCOS SLMs) could provide customized modulators and gratings. Researchers should also explore **ferroelectric liquid-crystal SLMs** and **thin-film lithium niobate modulators** for higher speeds.
*   **Computation & AI firms**: Collaborate with semiconductor companies (e.g., **NVIDIA, AMD**) and AI hardware startups to co-design FPGA/ASIC solutions for real-time beam control. Working with machine-learning researchers could yield adaptive algorithms for particle control and content generation.

## 8. Conclusions and next steps

Large-scale, free-floating volumetric displays remain a **moonshot** requiring coordinated advances in lasers, beam steering, scattering physics and computing. Our review suggests that **ionisation-based displays** are unsuitable for the Client's vision due to colour, power and safety limitations [5]. **Optical-trap displays**, while currently centimetre scale, offer a more promising route: they avoid clipping, support full colour and can, in principle, scale by increasing the number of trapped particles [1, 6]. Achieving tens-of-metres volumes will demand:

1.  **Advances in beam-splitting hardware**—likely through metasurface or photonic integrated OPAs—to deliver thousands of independently steerable beams with micrometre pitch and high refresh rates.
2.  **Improved trap design and particle engineering** to maintain stable confinement over longer paths and allow rapid particle replacement.
3.  **Custom computation and control systems** capable of streaming hundreds of millions of updates per second while generating physically accurate trajectories and illumination patterns.
4.  **Attention to eye safety, environmental control and user comfort** throughout the design.

In the near term, **the Client should prototype smaller volumetric displays** (tens of centimetres) using OTD technology, partnering with leading research groups such as BYU. This will provide empirical data on trap stability, beam steering and content generation, informing the feasibility of larger installations. While a 30–100 m interstitial hologram remains beyond current capabilities, sustained investment in optical trapping, metasurface beam steering and computing could ultimately enable immersive 3D experiences that meet the **Client's vision**.

## 9. References

[1] https://engineering.uci.edu/events/2019/5/eecs-seminar-free-space-full-color-volumetric-displays
[2] https://en.wikipedia.org/wiki/Volumetric_display
[3] https://ronaldazuma.com/LightField_2020.html
[4] https://www.cs.unc.edu/~maimone/media/tracked_display_SID_2014.pdf
[5] https://www.nature.com/articles/s41598-021-02107-3
[6] https://par.nsf.gov/servlets/purl/10141807
[7] https://en.wikipedia.org/wiki/Optical_tweezers
[8] https://arxiv.org/pdf/2402.03645
[9] https://www.nature.com/articles/s41598-018-23399-y
[10] https://www.laserfocusworld.com/optics/article/14036818/metasurface-beam-steering-enables-solid-state-high-performance-lidar
