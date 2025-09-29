import { useState } from "react";

interface Toast {
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = ({ title, description, variant = "default" }: Toast) => {
    // Simple implementation - just log for now
    console.log(`Toast [${variant}]: ${title}`, description ? `- ${description}` : '');

    // In a real implementation, you would add to a toast context or state
    // For now, we'll use browser alerts for important messages
    if (variant === "destructive") {
      alert(`Error: ${title}${description ? `\n${description}` : ''}`);
    } else {
      // Success messages can be more subtle
      console.info(`Success: ${title}${description ? ` - ${description}` : ''}`);
    }
  };

  return { toast, toasts };
}