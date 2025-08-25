import * as React from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useThrottle, useRenderOptimization } from '@/lib/performance-client'

interface MessageInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  placeholder?: string
}

export const MessageInput = React.memo(function MessageInput({ 
  onSend, 
  disabled = false,
  placeholder = "Message David..." 
}: MessageInputProps) {
  useRenderOptimization('MessageInput')
  
  const [message, setMessage] = React.useState('')
  const [isTyping, setIsTyping] = React.useState(false)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  
  const throttledOnChange = useThrottle((value: string) => {
    setMessage(value)
  }, 50)

  const handleSubmit = React.useCallback(() => {
    if (message.trim() && !disabled) {
      onSend(message.trim())
      setMessage('')
      setIsTyping(false)
      
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }, [message, disabled, onSend])

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  const handleChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    throttledOnChange(value)
    
    // Show typing indicator
    if (!isTyping && value.length > 0) {
      setIsTyping(true)
    }
    
    // Auto-resize textarea
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
  }, [throttledOnChange, isTyping])

  return (
    <div className="border-t bg-background px-4 py-4">
      <div className="mx-auto max-w-3xl">
        <div className="relative flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(
              'min-h-12 max-h-48 resize-none pr-12',
              'focus:ring-1 focus:ring-ring focus:border-ring'
            )}
            rows={1}
          />
          
          <Button 
            onClick={handleSubmit}
            disabled={disabled || !message.trim()}
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 size-8"
          >
            <Send className="size-4" />
          </Button>
        </div>
        
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}, (prevProps, nextProps) => {
  // Only re-render if disabled state or placeholder changes
  return prevProps.disabled === nextProps.disabled && 
         prevProps.placeholder === nextProps.placeholder
})