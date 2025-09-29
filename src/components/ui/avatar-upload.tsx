"use client";

import { useState, useRef } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase/client";
import { Upload, Camera, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface AvatarUploadProps {
  currentAvatar?: string | null;
  personaId: string;
  personaName: string;
  onAvatarChange: (newAvatarUrl: string | null) => void;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showLabel?: boolean;
}

export function AvatarUpload({
  currentAvatar,
  personaId,
  personaName,
  onAvatarChange,
  className,
  size = "md",
  showLabel = true
}: AvatarUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const sizeClasses = {
    sm: "w-12 h-12",
    md: "w-16 h-16",
    lg: "w-24 h-24",
    xl: "w-32 h-32"
  };

  const getPersonaInitials = () => {
    return personaName
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please select a JPEG, PNG, WebP, or SVG image.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select an image smaller than 5MB.",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);

    // Create preview URL
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      // Generate unique filename
      const timestamp = Date.now();
      const extension = selectedFile.name.split('.').pop();
      const filename = `${personaId}-${timestamp}.${extension}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('persona-avatars')
        .upload(filename, selectedFile, {
          contentType: selectedFile.type,
          upsert: true
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('persona-avatars')
        .getPublicUrl(filename);

      if (!urlData?.publicUrl) {
        throw new Error('Failed to get public URL');
      }

      // Update persona record
      const { error: updateError } = await supabase
        .from('personas')
        .update({ avatar_url: urlData.publicUrl })
        .eq('persona_id', personaId);

      if (updateError) {
        throw updateError;
      }

      // Delete old avatar if it exists and is from Supabase Storage
      if (currentAvatar && currentAvatar.includes('persona-avatars')) {
        const oldFilename = currentAvatar.split('/').pop();
        if (oldFilename && oldFilename !== filename) {
          await supabase.storage
            .from('persona-avatars')
            .remove([oldFilename]);
        }
      }

      onAvatarChange(urlData.publicUrl);
      setIsOpen(false);
      setSelectedFile(null);
      setPreviewUrl(null);

      toast({
        title: "Avatar updated",
        description: "Persona avatar has been successfully updated.",
      });

    } catch (error) {
      console.error('Avatar upload error:', error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload avatar. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!currentAvatar) return;

    setIsUploading(true);
    try {
      // Update persona record to remove avatar
      const { error: updateError } = await supabase
        .from('personas')
        .update({ avatar_url: null })
        .eq('persona_id', personaId);

      if (updateError) {
        throw updateError;
      }

      // Delete file from storage if it's from Supabase
      if (currentAvatar.includes('persona-avatars')) {
        const filename = currentAvatar.split('/').pop();
        if (filename) {
          await supabase.storage
            .from('persona-avatars')
            .remove([filename]);
        }
      }

      onAvatarChange(null);
      setIsOpen(false);

      toast({
        title: "Avatar removed",
        description: "Persona avatar has been removed.",
      });

    } catch (error) {
      console.error('Avatar removal error:', error);
      toast({
        title: "Removal failed",
        description: "Failed to remove avatar. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    setIsOpen(false);
    setSelectedFile(null);
    setPreviewUrl(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
  };

  return (
    <div className={cn("flex flex-col items-center space-y-2", className)}>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <div className="relative group cursor-pointer">
            <Avatar className={cn(sizeClasses[size], "border-2 border-border hover:border-primary transition-colors")}>
              <AvatarImage
                src={currentAvatar || undefined}
                alt={`${personaName} avatar`}
                className="object-cover"
              />
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white font-semibold">
                {getPersonaInitials()}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="w-4 h-4 text-white" />
            </div>
          </div>
        </DialogTrigger>

        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Persona Avatar</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Current/Preview Avatar */}
            <div className="flex justify-center">
              <Avatar className="w-24 h-24 border-2 border-border">
                <AvatarImage
                  src={previewUrl || currentAvatar || undefined}
                  alt={`${personaName} avatar`}
                  className="object-cover"
                />
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white font-semibold text-lg">
                  {getPersonaInitials()}
                </AvatarFallback>
              </Avatar>
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <Label htmlFor="avatar-upload">Choose new avatar</Label>
              <Input
                ref={fileInputRef}
                id="avatar-upload"
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp,image/svg+xml"
                onChange={handleFileSelect}
                className="cursor-pointer"
              />
              <p className="text-xs text-muted-foreground">
                Supports JPEG, PNG, WebP, and SVG. Max size: 5MB
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between space-x-2">
              <div>
                {currentAvatar && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveAvatar}
                    disabled={isUploading}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Remove
                  </Button>
                )}
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={isUploading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={!selectedFile || isUploading}
                >
                  {isUploading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      <span>Uploading...</span>
                    </div>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Update
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showLabel && (
        <p className="text-xs text-muted-foreground text-center">
          Click to change avatar
        </p>
      )}
    </div>
  );
}