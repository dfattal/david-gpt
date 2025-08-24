# Product Requirements Document: David-GPT

## Executive Summary

David-GPT is a ChatGPT-style conversational AI interface that impersonates David Fattal, Founder & CTO of Leia Inc. The product enables authenticated users to engage in conversations with an AI that embodies David's expertise in quantum computing, nanophotonics, immersive 3D displays, and Spatial AI.

## Product Vision

Create an intelligent conversational interface that authentically represents David Fattal's thought leadership and technical expertise, providing users with insights into the future of Spatial AI, 3D world simulation, and the technological foundations needed to transition from 1D language models to true spatial intelligence.

## Target Audience

- **Primary**: Technology enthusiasts, researchers, and industry professionals interested in spatial computing, quantum technologies, and AI advancement
- **Secondary**: Investors, partners, and potential collaborators in the spatial AI ecosystem
- **Tertiary**: General users curious about the future of immersive technologies

## David Fattal Persona & Expertise

### Background
David Fattal has spent his career at the frontier of technology, pioneering advances in:
- **Quantum Computing**: Deep expertise in quantum systems and computational approaches
- **Nanophotonics**: Advanced knowledge of light manipulation at nanoscale
- **Immersive 3D Displays**: Revolutionary work in spatial visual technologies
- **Spatial AI**: Current focus as Founder & CTO of Leia Inc.

### Core Philosophy
David argues that achieving true intelligence requires:
- Real-world 3D content capture platforms
- Planetary-scale corpus of spatial data
- Evolution from 1D language models → 2D content generators → 3D world simulators
- Integration of physical and digital spatial understanding

### Communication Style
- Visionary but grounded in technical reality
- Bridges complex quantum/photonic concepts with practical AI applications
- Forward-thinking perspective on technology evolution
- Emphasis on spatial data as foundation for next-gen AI

## MVP Feature Requirements

### 1. Authentication & User Management
- **Google OAuth via Supabase Auth**
  - Single sign-on with Google accounts
  - Secure session management
  - User profile persistence
  - Automatic session refresh

### 2. Chat Interface (ChatGPT-style UI)
- **Message Display**
  - User messages (right-aligned, distinct styling)
  - Assistant messages (left-aligned, David Fattal persona)
  - Streaming response display with typing indicators
  - Message timestamps
  - Avatar/profile images
  
- **Input Interface**
  - Text input field with placeholder
  - Send button and Enter-to-send functionality
  - Character count (optional)
  - Loading states during message processing

### 3. Conversation Management
- **Left Sidebar Panel**
  - List of user's conversations
  - Sorted by most recent activity
  - Visual indicators for active conversation
  - Create new conversation button
  
- **Conversation Operations**
  - **Automatic Title Generation**: LLM-generated 3-6 word titles based on first exchange
  - **Rename**: Click-to-edit conversation titles
  - **Delete**: Soft delete with confirmation dialog
  - **Persistent Storage**: All conversations saved to database

### 4. Chat Functionality
- **Real-time Streaming**
  - Token-by-token response streaming
  - Vercel AI SDK v5 integration
  - OpenAI GPT-4 backend (configured for David Fattal persona)
  
- **Message Actions**
  - **Retry**: Regenerate assistant responses
  - **Copy**: Copy messages to clipboard
  - Message persistence across sessions
  
### 5. Responsive Design
- **Desktop**: Full sidebar + chat interface
- **Mobile**: Collapsible sidebar, touch-optimized
- **Tablet**: Adaptive layout
- **shadcn/ui Components**: Consistent design system

## Technical Architecture

### Frontend Stack
- **Framework**: Next.js 15 with App Router
- **UI Library**: shadcn/ui components
- **Styling**: Tailwind CSS v4
- **State Management**: React Query for server state, React context for UI state
- **Real-time**: Server-Sent Events (SSE) for streaming

### Backend Stack
- **API**: Next.js API routes
- **AI Integration**: Vercel AI SDK v5 + OpenAI GPT-4
- **Database**: Supabase (PostgreSQL + Auth + RLS)
- **Authentication**: Supabase Auth with Google OAuth

### Database Schema
```sql
conversations (
  id uuid primary key,
  owner uuid references auth.users(id),
  title text default 'New chat',
  title_status text default 'pending', -- pending|ready|error
  created_at timestamptz,
  updated_at timestamptz,
  last_message_at timestamptz,
  deleted_at timestamptz
)

messages (
  id bigserial primary key,
  conversation_id uuid references conversations(id),
  role text check (role in ('user','assistant','system','tool')),
  parts jsonb, -- AI SDK v5 UIMessage parts
  provider_message_id text,
  created_at timestamptz
)
```

## AI Persona Configuration

### System Prompt Template
```
You are David Fattal, Founder & CTO of Leia Inc. You have spent your career pioneering advances in quantum computing, nanophotonics, and immersive 3D displays. You are currently focused on accelerating the path to Spatial AI.

Core beliefs and expertise:
- True intelligence requires real-world 3D content capture platforms
- Need for planetary-scale corpus of spatial data
- Evolution from 1D language models → 2D content generators → 3D world simulators
- Deep technical knowledge in quantum computing and nanophotonics
- Visionary perspective on immersive technologies and spatial computing

Communication style:
- Technical but accessible
- Forward-thinking and visionary
- Grounded in scientific principles
- Passionate about spatial AI potential
- Bridge complex concepts to practical applications
```

### Response Guidelines
- Embody David's expertise in quantum computing, nanophotonics, and spatial AI
- Reference Leia Inc.'s mission and spatial computing vision
- Draw connections between different technology domains
- Provide forward-looking perspectives on AI evolution
- Maintain authentic, knowledgeable tone

## User Experience Flow

### 1. Authentication Flow
1. User visits app → redirected to login if not authenticated
2. Click "Sign in with Google" → Supabase Auth flow
3. Successful auth → redirect to main chat interface

### 2. First-Time User Experience
1. Empty conversation list in sidebar
2. Default "New chat" conversation created
3. Welcome message from David Fattal persona
4. Clear input field with placeholder text

### 3. Chat Experience
1. User types message → press Enter or Send button
2. Message appears immediately in chat
3. Assistant response streams in real-time
4. Auto-generate conversation title after first exchange
5. Continue conversation with full context

### 4. Conversation Management
1. Create new conversation → appears at top of sidebar
2. Switch conversations → load message history instantly
3. Rename conversation → click title, edit inline
4. Delete conversation → confirmation dialog, soft delete

## Success Metrics

### Primary KPIs
- **User Engagement**: Messages per session, session duration
- **Conversation Quality**: User satisfaction with David persona authenticity
- **Retention**: Weekly/Monthly active users
- **Technical Performance**: Response latency, streaming reliability

### Secondary Metrics
- **Conversation Management**: Average conversations per user
- **Feature Usage**: Retry, rename, delete functionality adoption
- **Performance**: Core Web Vitals, page load times
- **Authentication**: Google OAuth conversion rate

## Future Enhancements (Post-MVP)

### Phase 2: RAG Integration
- **Vector Database**: Embed David Fattal's publications, talks, interviews
- **Context Retrieval**: Pull relevant technical content for responses
- **Knowledge Base**: Leia Inc. product information, spatial AI research
- **Document Upload**: Users can query David's perspective on uploaded content

### Phase 3: Advanced Features
- **Voice Interface**: Speech-to-text and text-to-speech
- **3D Visualizations**: Interactive spatial AI demonstrations
- **Multi-modal**: Image/video analysis capabilities
- **API Access**: Developer API for David Fattal persona

### Phase 4: Platform Expansion
- **Mobile Apps**: Native iOS/Android applications
- **Integrations**: Slack, Teams, other platforms
- **Collaboration**: Multi-user conversations
- **Analytics**: Conversation insights and trending topics

## Constraints & Assumptions

### Technical Constraints
- OpenAI API rate limits and costs
- Supabase database connection limits
- Vercel deployment constraints
- Real-time streaming reliability

### Business Assumptions
- Users interested in spatial AI and emerging technologies
- Value in conversational access to David Fattal's expertise
- Google OAuth sufficient for authentication
- English-only conversations for MVP

## Risk Mitigation

### Technical Risks
- **AI Hallucination**: Implement persona consistency checks
- **Performance**: Monitor and optimize streaming latency
- **Scalability**: Plan for user growth and database scaling
- **Security**: Ensure proper RLS and data isolation

### Business Risks
- **Persona Authenticity**: Regular review of AI responses
- **User Adoption**: Clear value proposition communication
- **Cost Management**: Monitor AI API usage and costs
- **Competition**: Differentiate through specialized expertise

## Launch Criteria

### MVP Ready Checklist
- [ ] Google OAuth authentication working
- [ ] Real-time chat streaming functional
- [ ] Conversation persistence and management
- [ ] Automatic title generation
- [ ] David Fattal persona responses authentic
- [ ] Mobile responsive design
- [ ] Core Web Vitals meeting targets
- [ ] E2E test coverage complete
- [ ] Production deployment successful

### Performance Targets
- **Response Latency**: <200ms first token
- **Core Web Vitals**: LCP <2500ms, FID <100ms, CLS <0.1
- **Lighthouse Score**: ≥90% across all categories
- **Bundle Size**: Initial gzip <200KB
- **Uptime**: 99.9% availability
- **User Experience**: Smooth streaming, no message loss

## Conclusion

David-GPT represents an innovative approach to conversational AI by embodying a specific technical expert's knowledge and vision. The MVP focuses on delivering a polished ChatGPT-style experience while authentically representing David Fattal's expertise in spatial AI and emerging technologies. The foundation is designed to support future enhancements including RAG integration and advanced spatial AI demonstrations.