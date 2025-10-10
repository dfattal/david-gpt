/**
 * PersonaList Component
 * Displays all personas with actions (edit, delete, activate/deactivate)
 */

'use client';

import { useState } from 'react';
import { usePersonas } from '@/hooks/usePersonas';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Edit,
  Trash2,
  ToggleLeft,
  ToggleRight,
  User,
  Bot
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

interface PersonaListProps {
  onEdit: (slug: string) => void;
  onRefresh?: () => void;
}

export function PersonaList({ onEdit, onRefresh }: PersonaListProps) {
  const { personas, isLoading, mutate } = usePersonas();
  const [deleteSlug, setDeleteSlug] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const handleToggleActive = async (slug: string, currentlyActive: boolean) => {
    try {
      const response = await fetch(`/api/admin/personas/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentlyActive }),
      });

      if (!response.ok) {
        throw new Error('Failed to toggle persona status');
      }

      toast({
        title: currentlyActive ? 'Persona Deactivated' : 'Persona Activated',
        description: `${slug} is now ${currentlyActive ? 'inactive' : 'active'}`,
      });

      mutate();
      onRefresh?.();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to toggle status',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteSlug) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/personas/${deleteSlug}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete persona');
      }

      toast({
        title: 'Persona Deleted',
        description: `${deleteSlug} has been permanently deleted`,
      });

      mutate();
      onRefresh?.();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete persona',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setDeleteSlug(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-muted-foreground">Loading personas...</div>
      </div>
    );
  }

  if (!personas || personas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 border border-dashed rounded-lg">
        <p className="text-muted-foreground mb-4">No personas found</p>
        <p className="text-sm text-muted-foreground">
          Upload a persona.md file to create your first persona
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Expertise</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {personas.map((persona) => (
              <TableRow key={persona.slug}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {persona.persona_type === 'real_person' ? (
                      <User className="h-4 w-4 text-blue-500" />
                    ) : (
                      <Bot className="h-4 w-4 text-purple-500" />
                    )}
                    {persona.name || persona.slug}
                  </div>
                </TableCell>
                <TableCell>
                  <code className="text-xs bg-muted px-2 py-1 rounded">
                    {persona.slug}
                  </code>
                </TableCell>
                <TableCell>
                  <Badge variant={persona.persona_type === 'real_person' ? 'default' : 'secondary'}>
                    {persona.persona_type === 'real_person' ? 'Real Person' : 'Character'}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-md truncate">
                  {persona.expertise || <span className="text-muted-foreground italic">No expertise set</span>}
                </TableCell>
                <TableCell>
                  <Badge variant={persona.is_active ? 'default' : 'outline'}>
                    {persona.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(persona.slug)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleActive(persona.slug, persona.is_active || false)}
                    >
                      {persona.is_active ? (
                        <ToggleRight className="h-4 w-4" />
                      ) : (
                        <ToggleLeft className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteSlug(persona.slug)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteSlug} onOpenChange={(open) => !open && setDeleteSlug(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the persona <code className="bg-muted px-1 rounded">{deleteSlug}</code>.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete Persona'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
