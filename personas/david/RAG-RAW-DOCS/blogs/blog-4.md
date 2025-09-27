---
title: 'The Spatial Shift #4 | Building the Foundation for Spatial Intelligence'
docType: Blog
url: 'https://www.linkedin.com/pulse/building-foundation-spatial-intelligence-david-fattal-wpahc'
scraped_at: '2025-09-26T06:10:00.000Z'
word_count: 780
extraction_quality: high
outlet: 'The Spatial Shift'
published_date: '2025-09-16T10:00:00.000Z'
authors:
  - name: David Fattal
    affiliation: Leia Inc
---

# The Spatial Shift #4 | Building the Foundation for Spatial Intelligence

The next major leap in artificial intelligence won't come from language alone. While large language models (LLMs) have excelled at text-based tasks, another essential domain of our world remains largely untapped: the physical. To achieve Artificial General Intelligence (AGI) or even Artificial Superintelligence (ASI), AI systems must develop the ability to understand the 3D structure of the world around us, a capability known as Spatial Intelligence.
Spatial Intelligence means AI constructs internal 3D models of the world—grasping depth, geometry, object permanence, and spatial relationships—enabling it to reason, predict, and act in ways that mirror human perception. As Fei-Fei Li, co-director of the Stanford Human-Centered AI Institute, puts it:

> "We don't live in a flat world. We live in a 3D world, and building AI that can understand and navigate that world is essential for reaching general intelligence."

Mark Zuckerberg echoed a similar sentiment in his recent letter outlining Meta's AI vision, emphasizing the importance of building "Personal Superintelligence"—AI that deeply understands and adapts to an individual's personal context and physical surroundings. Zuckerberg argues that this level of contextual awareness can only emerge through AI's intimate understanding of the real-world environment each person inhabits daily.
Spatial intelligence isn't a side quest—it's foundational. But unlike text-based AI, which benefits from vast corpora scraped from the web, spatially intelligent models suffer from a critical shortage of large-scale, diverse 3D training data. As Li noted in a recent interview:

> "There's not a lot of material to train spatial intelligence. We don't have billions and billions of scenes like we have text."

This data bottleneck remains one of the biggest challenges in building AI that truly sees and understands the world as we do. Text and 2D models thrived because the internet accidentally produced web-scale corpora. Spatial AI has no equivalent 3D corpus.
Controlled rigs and lab scanners help, but they can't capture your kitchen at 10 p.m., a crowded subway at rush hour, a rainy windshield, or a toddler hiding under a table.
Nvidia's push toward "Physical AI" with Omniverse and Cosmos models—to generate and rehearse the physical world at massive scale for robots and vehicles to learn—is a powerful and promising approach. But this purely synthetic data lacks the long-tail messiness of the lived world. The right answer isn't synthetic or real; it's both. And to avoid "model collapse" from self-generation, models must be seeded, refreshed, and corrected with authentic human-captured data.
A natural question arises: can we train Spatial AI using ordinary videos alone? After all, moving phones capture multiple viewpoints over time, and OpenAI has even described video diffusion models as "world simulators" systems that learn to predict the evolution of a scene from frame to frame. This is the same line of thinking driving RunwayML’s recent pivot, where its video generation models are now being fine-tuned for robotics training. The appeal is clear: simulated rollouts are cheaper and faster than collecting endless real-world examples. But here’s the catch: these models are fundamentally guessing what comes next, not knowing the true 3D structure behind the pixels. They churn plausible frames, not grounded geometry.
As Yann LeCun frames it: today's models predict what's likely to follow, but they lack the internal simulation—or "world model"—needed to reason about sequence, causality, and spatial consistency across time. 
Prediction is not understanding.
Video only makes the challenge harder, because it tangles together two signals: the motion of the camera and the motion of the world itself. Walk through a crowd, film rippling water, or pan past a mirror, and the AI struggles to separate parallax from true dynamics. The outcome is unstable—geometry bends, reflections smear, and flicker creeps in. Video-only models can look plausible, but they don’t always hold up when reliability matters.
That’s why stereo or multi-view captures are so important. Synthetic datasets provide the broad scaffolding that teaches models the rules of 3D structure at scale, and 2D video fills that scaffolding with motion, texture, and dynamics. But it is real-world 3D data that sharpens the edges, anchoring the messy details that synthetic and video alone often miss. 
When it comes to making a mental representation of a 3D environment, synthetic data build the map, video data paint it in, and real-world 3D data keep the picture true.
To make this idea more concrete, imagine teaching an AI to “redraw” a scene from a slightly different angle—like shifting your head while looking at a car’s rear-view mirror. If the AI has only been trained on flat videos and computer-generated scenes, it tends to get things wrong in complex situations: shiny reflections smear, edges of the mirror wiggle, and objects don’t stay locked in place.
But if we add real-world stereo data—two images captured at the same moment from slightly different viewpoints—the AI suddenly has a solid anchor. The reflections stay put, the edges of the mirror hold their shape, and the geometry of the scene doesn’t fall apart. The improvement isn’t just about looks—it’s about giving the model a true structural understanding of the world rather than a clever guess.
So how do we build the 3D corpus?
We could wait for broad AR-glasses adoption or fleets of household robots to passively 3D-map our world. But that's a decade-plus path, with steep consumer adoption hurdles and obvious issues of social acceptance (remember the glass-holes?).
Or we can start now by turning the world's most distributed sensor—the smartphone—into a 3D capture device with instant payoff.
In fact, many modern smartphones, including flagship iPhones, already ship with stereo-recording capabilities. On paper, Big Tech could flip a switch and enforce every photo or video to be saved in 3D, then harvest the data through cloud storage services like iCloud or Google Photos. But that will not happen. Why? Because forcing stereo capture degrades the flexibility and quality of everyday 2D photos—no zoom, larger file sizes, harder to apply multi-frame image processing—and it provides no immediate benefit to the consumer. Without clear value, users won't opt in, and doing it quietly raises consent and privacy red flags.
This is why the arrival of consumer-ready 3D displays is such a critical inflection point. In the last year alone we've seen mainstream launches of 3D tablets, laptops, and monitors from Samsung, Acer, Lenovo, and ZTE. The missing link for planetary-scale spatial data collection is a phone that not only captures stereo data but lets users see it instantly.
Real-time 3D visualization creates direct value: people immediately see, share, and cherish the 3D content they've just captured. That instant gratification is what drives behavior, which drives scale, which builds the dataset.
At that point, the social networks and messaging platforms follow suit. Once consumers start sharing immersive 3D memories the way they share 2D photos and videos today, the platforms will be compelled to support native 3D formats. This creates the same kind of flywheel we saw with photos and videos: richer user experiences lead to more capture and more sharing, which generates the training data that makes AI smarter at interpreting and enhancing the medium.
This pathway also aligns directly with Mark Zuckerberg's call for Personal Superintelligence—AI that deeply understands each individual's personal context and environment. The most direct way to feed AI with this kind of contextual data is through personal devices, but instead of waiting for mass AR-glasses adoption, we can use the devices already in billions of hands today. Smartphones with 3D capture and real-time playback are the shortest path to building the planetary-scale 3D dataset required for Spatial Intelligence.
The trajectory of AI can be read as a progression of dimensions: from 1D text (LLMs), to 2D images and video (Diffusion Models), and now to 3D space (Spatial AI). Each leap required a new kind of training corpus—books and the web for text, social media images and video for vision—and each leap unlocked a radically more powerful capability.
Spatial Intelligence is the next leap. It is not optional, and it is not a sideshow. It is the foundation on which autonomous robots, intelligent AR glasses, and deeply contextual assistants will be built. It is what will make world models reliable, grounded, and safe.
And just as ImageNet and Common Crawl became the indispensable fuel for past revolutions, the creation of a massive, diverse, real-world 3D dataset will be the catalyst for the next one. The tools to start are already in our hands. The only question is who will recognize this inflection point soon enough to lead.
