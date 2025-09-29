import type { PersonaOption } from "@/components/chat/persona-selector";

export function getPersonaAvatar(persona: PersonaOption | null): string {
  if (!persona) {
    return generateDefaultAvatar();
  }

  // Use Supabase Storage URL if available
  if (persona.avatar_url) {
    return persona.avatar_url;
  }

  // Use local persona avatar images from /public/personas
  const localAvatarPath = getLocalAvatarPath(persona.persona_id);
  if (localAvatarPath) {
    return localAvatarPath;
  }

  // Fallback to generated avatar URL using avatar generation service
  return generateAvatarUrl(persona);
}

export function generateAvatarUrl(persona: PersonaOption): string {
  // Generate initials-based avatar with persona theme colors
  const initials = getPersonaInitials(persona);
  const theme = getPersonaThemeColors(persona.persona_id);
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&size=128&background=${theme.bg}&color=${theme.text}&bold=true&format=svg`;
}

export function getLocalAvatarPath(personaId: string): string | null {
  // Map persona IDs to their local avatar files
  const avatarMap: Record<string, string> = {
    'david': '/personas/david.jpg',
    'legal': '/personas/legal.svg',
    // Add more mappings as you add more persona avatars
  };

  return avatarMap[personaId] || null;
}

export function generateDefaultAvatar(): string {
  // Use local default avatar if available, otherwise fallback to generated
  return '/personas/default.svg';
}

export function getPersonaInitials(persona: PersonaOption): string {
  if (!persona.name || typeof persona.name !== 'string') {
    return persona.persona_id?.slice(0, 2).toUpperCase() || 'AI';
  }

  return persona.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function getPersonaThemeColors(personaId: string): { bg: string; text: string } {
  const themes: Record<string, { bg: string; text: string }> = {
    'david': { bg: '6366f1', text: 'ffffff' }, // indigo
    'legal': { bg: '1e40af', text: 'ffffff' }, // blue
    'medical': { bg: '059669', text: 'ffffff' }, // emerald
    'financial': { bg: 'ea580c', text: 'ffffff' }, // orange
    'technical': { bg: '475569', text: 'ffffff' }, // slate
    'marketing': { bg: 'dc2626', text: 'ffffff' }, // red
    'design': { bg: '7c3aed', text: 'ffffff' }, // violet
    'academic': { bg: '0891b2', text: 'ffffff' }, // cyan
  };
  return themes[personaId] || { bg: '6b7280', text: 'ffffff' }; // gray default
}