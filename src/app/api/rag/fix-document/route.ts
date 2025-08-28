import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const TEST_DOCUMENT_CONTENT = `# AI Leaders on Large World Models and Spatial Intelligence

The consensus among prominent AI leaders is that **spatial intelligence is the next major frontier for artificial intelligence**, representing a critical step towards achieving more capable and general AI. This involves moving beyond text-based models to create AI that can perceive, understand, and interact with the 3D world.

Here are the key perspectives from industry and AI leaders:

### Fei-Fei Li: The "Cambrian Explosion" of AI

Dr. Fei-Fei Li, a leading AI researcher and co-founder of **World Labs**, is a vocal advocate for the development of **Large World Models (LWMs)**.

*   **Spatial Intelligence as the Next Step:** Li argues that for AI to reach its full potential, it must move beyond language and develop a deep understanding of the physical world. She compares the current moment in AI to the "Cambrian explosion," where the evolution of vision in organisms led to a rapid diversification of life.
*   **World Labs:** Her startup, World Labs, is dedicated to building LWMs that can process and generate 3D environments. Their goal is to elevate AI from processing 2D pixels to understanding and operating in full 3D, with applications in robotics, gaming, and simulation.

### Yann LeCun: The Necessity of World Models for Reasoning

Yann LeCun, Chief AI Scientist at Meta, has long advocated for a move beyond large language models towards what he calls "world models."

*   **Beyond Language:** LeCun expresses skepticism that language models alone can achieve true reasoning and planning. He argues that AI needs to learn the underlying principles of how the world works through self-supervised learning.
*   **Joint Embedding Predictive Architecture (JEPA):** His work on JEPA aims to build AI that can understand the relationships between objects in space and time, enabling the system to predict and reason about the world in a more sophisticated way than simply recognizing patterns in data.

### Geoffrey Hinton: The Importance of Multimodality and Interaction

Geoffrey Hinton, a "godfather of AI," emphasizes the need for AI to be multimodal and to learn through interaction.

*   **Learning by Doing:** Hinton suggests that for an AI to truly understand a spatial concept, it needs to be able to interact with it physically. For example, to understand what a "box" is, an AI should be able to pick it up and manipulate it.
*   **Multimodal Systems:** He argues that language models, while powerful, need to be integrated with vision and other sensory inputs to develop a genuine grasp of spatial concepts.

### Other Key Developments:

*   **Google DeepMind's "Genie":** Google's AI lab has developed a "foundation world model" called Genie, which can generate playable, interactive 2D environments from a single image prompt. This is a significant step towards creating AI that can simulate and interact with complex worlds.
*   **Foundational Work:** The concept of "world models" has roots in earlier research, such as the 2018 paper by David Ha and Jürgen Schmidhuber, which demonstrated how an AI agent could learn a compressed representation of its environment to "dream" and learn within its own simulation.

In summary, AI leaders are signaling a major shift in the field. While large language models have demonstrated remarkable capabilities, the next wave of innovation is expected to come from **Large World Models** and the development of **spatial intelligence**. This will enable AI to move beyond the digital realm and begin to truly understand and interact with the physical world, unlocking a new generation of applications and bringing us closer to the goal of artificial general intelligence.`

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Find the document that needs fixing
    const { data: documents, error: findError } = await supabase
      .from('rag_documents')
      .select('*')
      .eq('owner', user.id)
      .ilike('title', '%Large_World_Models%')

    if (findError || !documents || documents.length === 0) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    const document = documents[0]

    // Update the document with the content
    const { error: updateError } = await supabase
      .from('rag_documents')
      .update({
        labels: {
          ...document.labels,
          raw_content: TEST_DOCUMENT_CONTENT
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', document.id)

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update document: ' + updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Document content added successfully',
      document: {
        id: document.id,
        title: document.title,
        content_length: TEST_DOCUMENT_CONTENT.length
      }
    })

  } catch (error) {
    console.error('Fix document failed:', error)
    
    return NextResponse.json(
      { 
        error: 'Failed to fix document',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}