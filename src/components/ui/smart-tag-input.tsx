'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { X, Plus, Wand2, ChevronDown } from 'lucide-react'

interface TagSuggestion {
  tag: string
  category: 'technology' | 'company' | 'concept' | 'person' | 'product' | 'domain' | 'methodology'
  confidence: number
  reasoning: string
}

interface SmartTagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  maxTags?: number
  disabled?: boolean
  content?: string // Content to analyze for AI suggestions
  className?: string
}

export function SmartTagInput({
  value = [],
  onChange,
  placeholder = "Enter tags...",
  maxTags = 20,
  disabled = false,
  content,
  className = ""
}: SmartTagInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [aiSuggestions, setAiSuggestions] = useState<TagSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  const [isLoadingAI, setIsLoadingAI] = useState(false)
  
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch popular tag suggestions
  const fetchSuggestions = useCallback(async (query: string) => {
    try {
      const response = await fetch(`/api/rag/tags?type=suggestions&q=${encodeURIComponent(query)}&limit=10`)
      if (response.ok) {
        const data = await response.json()
        setSuggestions(data.suggestions || [])
      }
    } catch (error) {
      console.error('Failed to fetch tag suggestions:', error)
    }
  }, [])

  // Fetch AI-powered suggestions based on content
  const fetchAISuggestions = useCallback(async () => {
    if (!content || content.trim().length < 50) return

    setIsLoadingAI(true)
    try {
      const response = await fetch('/api/rag/tags/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          existingTags: value,
          options: {
            maxSuggestions: 6,
            confidenceThreshold: 0.6
          }
        })
      })

      if (response.ok) {
        const data = await response.json()
        setAiSuggestions(data.suggestedTags || [])
      }
    } catch (error) {
      console.error('Failed to fetch AI tag suggestions:', error)
    } finally {
      setIsLoadingAI(false)
    }
  }, [content, value])

  // Debounced suggestion fetching
  useEffect(() => {
    if (suggestionsTimeoutRef.current) {
      clearTimeout(suggestionsTimeoutRef.current)
    }

    if (inputValue.trim()) {
      suggestionsTimeoutRef.current = setTimeout(() => {
        fetchSuggestions(inputValue.trim())
      }, 300)
    } else {
      setSuggestions([])
    }

    return () => {
      if (suggestionsTimeoutRef.current) {
        clearTimeout(suggestionsTimeoutRef.current)
      }
    }
  }, [inputValue, fetchSuggestions])

  // Fetch AI suggestions when content changes
  useEffect(() => {
    if (content && aiSuggestions.length === 0) {
      fetchAISuggestions()
    }
  }, [content, aiSuggestions.length, fetchAISuggestions])

  const addTag = (tag: string) => {
    const trimmedTag = tag.trim()
    if (trimmedTag && !value.includes(trimmedTag) && value.length < maxTags) {
      onChange([...value, trimmedTag])
      setInputValue('')
      setShowSuggestions(false)
    }
  }

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter(tag => tag !== tagToRemove))
  }

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (inputValue.trim()) {
        addTag(inputValue)
      }
    } else if (e.key === 'Backspace' && inputValue === '' && value.length > 0) {
      removeTag(value[value.length - 1])
    }
  }

  const getCategoryColor = (category: string) => {
    const colors = {
      technology: 'bg-blue-100 text-blue-700',
      company: 'bg-green-100 text-green-700',
      concept: 'bg-purple-100 text-purple-700',
      person: 'bg-orange-100 text-orange-700',
      product: 'bg-pink-100 text-pink-700',
      domain: 'bg-gray-100 text-gray-700',
      methodology: 'bg-indigo-100 text-indigo-700'
    }
    return colors[category as keyof typeof colors] || 'bg-gray-100 text-gray-700'
  }

  const filteredSuggestions = suggestions.filter(suggestion => 
    !value.includes(suggestion) && 
    suggestion.toLowerCase().includes(inputValue.toLowerCase())
  )

  const availableAISuggestions = aiSuggestions.filter(suggestion => 
    !value.includes(suggestion.tag)
  )

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Current tags display */}
      <div className="flex flex-wrap gap-1">
        {value.map(tag => (
          <Badge 
            key={tag} 
            variant="secondary" 
            className="px-2 py-1"
          >
            {tag}
            {!disabled && (
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="ml-1 text-gray-400 hover:text-gray-600"
              >
                <X size={12} />
              </button>
            )}
          </Badge>
        ))}
      </div>

      {/* Input with suggestions */}
      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleInputKeyDown}
          onFocus={() => setShowSuggestions(true)}
          placeholder={value.length >= maxTags ? 'Maximum tags reached' : placeholder}
          disabled={disabled || value.length >= maxTags}
          className="pr-10"
        />
        
        {/* Suggestions dropdown */}
        {showSuggestions && !disabled && (filteredSuggestions.length > 0 || availableAISuggestions.length > 0) && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
            
            {/* Popular suggestions */}
            {filteredSuggestions.length > 0 && (
              <div>
                <div className="px-3 py-2 text-xs font-medium text-gray-500 border-b">
                  Popular tags
                </div>
                {filteredSuggestions.map(suggestion => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => addTag(suggestion)}
                    className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                  >
                    <span>{suggestion}</span>
                  </button>
                ))}
              </div>
            )}

            {/* AI suggestions */}
            {availableAISuggestions.length > 0 && (
              <div>
                <div className="px-3 py-2 text-xs font-medium text-gray-500 border-b flex items-center gap-1">
                  <Wand2 size={12} />
                  AI suggested tags
                  {isLoadingAI && <span className="text-gray-400">(analyzing...)</span>}
                </div>
                {availableAISuggestions.map(suggestion => (
                  <button
                    key={suggestion.tag}
                    type="button"
                    onClick={() => addTag(suggestion.tag)}
                    className="w-full px-3 py-2 text-left hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>{suggestion.tag}</span>
                        <Badge className={`text-xs ${getCategoryColor(suggestion.category)}`}>
                          {suggestion.category}
                        </Badge>
                      </div>
                      <span className="text-xs text-gray-400">
                        {Math.round(suggestion.confidence * 100)}%
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {suggestion.reasoning}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* AI suggestion trigger */}
      {content && !isLoadingAI && availableAISuggestions.length === 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={fetchAISuggestions}
          className="text-xs"
        >
          <Wand2 size={12} className="mr-1" />
          Get AI suggestions
        </Button>
      )}

      {/* Quick add from AI suggestions */}
      {availableAISuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Wand2 size={10} />
            Suggested:
          </span>
          {availableAISuggestions.slice(0, 3).map(suggestion => (
            <button
              key={suggestion.tag}
              type="button"
              onClick={() => addTag(suggestion.tag)}
              className={`text-xs px-2 py-1 rounded-full border border-dashed hover:border-solid ${getCategoryColor(suggestion.category)}`}
            >
              <Plus size={10} className="mr-1" />
              {suggestion.tag}
            </button>
          ))}
        </div>
      )}

      {/* Helper text */}
      <p className="text-xs text-gray-500">
        Press Enter or comma to add tags. {value.length}/{maxTags} tags used.
      </p>
    </div>
  )
}