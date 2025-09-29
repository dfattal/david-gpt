"use client";

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { 
  AlertTriangle, 
  Skull,
  Database,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react';

interface DatabaseResetDialogProps {
  open: boolean;
  onClose: () => void;
}

interface ResetResult {
  message: string;
  success: boolean;
  summary: {
    totalTablesProcessed: number;
    successfulDeletions: number;
    failedDeletions: number;
    totalRecordsDeleted: number;
  };
  initialCounts: Record<string, number>;
  finalCounts: Record<string, number>;
  deletionResults: Record<string, { success: boolean; error?: string; deletedCount?: number }>;
  timestamp: string;
}

export function DatabaseResetDialog({ open, onClose }: DatabaseResetDialogProps) {
  const [step, setStep] = useState<'warning' | 'confirm' | 'executing' | 'complete'>('warning');
  const [confirmationText, setConfirmationText] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [resetResult, setResetResult] = useState<ResetResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    // Reset all state when closing
    setStep('warning');
    setConfirmationText('');
    setUnderstood(false);
    setResetResult(null);
    setError(null);
    onClose();
  };

  const handleContinueToConfirm = () => {
    if (understood) {
      setStep('confirm');
    }
  };

  const handleExecuteReset = async () => {
    if (confirmationText !== 'DELETE ALL DATA') {
      setError('Confirmation text must match exactly: "DELETE ALL DATA"');
      return;
    }

    setStep('executing');
    setError(null);

    try {
      const response = await fetch('/api/admin/reset-database', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token') || 'dummy_token'}`
        },
        body: JSON.stringify({
          confirmationText
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Database reset failed');
      }

      setResetResult(result);
      setStep('complete');

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Database reset failed');
      setStep('confirm');
    }
  };

  const renderWarningStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
          <Skull className="w-8 h-8 text-red-600" />
        </div>
        <h3 className="text-lg font-bold text-red-900 mb-2">
          ⚠️ DANGER: DATABASE RESET ⚠️
        </h3>
      </div>

      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-start">
          <AlertTriangle className="w-6 h-6 text-red-600 mr-3 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-semibold text-red-900 mb-2">
              This action will PERMANENTLY DELETE ALL DATA
            </h4>
            <ul className="text-sm text-red-800 space-y-1">
              <li>• All entities and relationships in the knowledge graph</li>
              <li>• All uploaded documents and their content</li>
              <li>• All conversation history and messages</li>
              <li>• All user profiles and authentication data</li>
              <li>• All processing jobs and search queries</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start">
          <AlertTriangle className="w-5 h-5 text-yellow-600 mr-2 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-medium text-yellow-900 mb-1">Important Notes:</h4>
            <ul className="text-sm text-yellow-800 space-y-1">
              <li>• This action is IRREVERSIBLE - there is no undo</li>
              <li>• No backups will be created automatically</li>
              <li>• You will need to re-upload all documents</li>
              <li>• All users will need to re-authenticate</li>
              <li>• This should ONLY be used in testing environments</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-2">Recommended Before Reset:</h4>
        <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside">
          <li>Backup any important data you want to preserve</li>
          <li>Confirm you&apos;re in a testing environment</li>
          <li>Notify other team members who might be using the system</li>
          <li>Document any test scenarios you want to recreate</li>
        </ol>
      </div>

      <div className="flex items-center space-x-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <input
          type="checkbox"
          id="understood"
          checked={understood}
          onChange={(e) => setUnderstood(e.target.checked)}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <label htmlFor="understood" className="text-sm font-medium text-blue-900">
          I understand this will permanently delete all data and cannot be undone
        </label>
      </div>
    </div>
  );

  const renderConfirmStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
          <Database className="w-8 h-8 text-red-600" />
        </div>
        <h3 className="text-lg font-bold text-red-900 mb-2">
          Final Confirmation Required
        </h3>
        <p className="text-red-700">
          You are about to delete ALL data from the database
        </p>
      </div>

      <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
        <p className="text-red-900 font-medium mb-3">
          To proceed, type exactly: <code className="bg-red-200 px-2 py-1 rounded font-mono">DELETE ALL DATA</code>
        </p>
        <Input
          value={confirmationText}
          onChange={(e) => setConfirmationText(e.target.value)}
          placeholder="Type: DELETE ALL DATA"
          className="font-mono text-center border-red-300 focus:border-red-500 focus:ring-red-500"
        />
        <div className="mt-2 text-center">
          {confirmationText === 'DELETE ALL DATA' ? (
            <Badge className="bg-red-600 text-white">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Confirmation Valid
            </Badge>
          ) : confirmationText.length > 0 ? (
            <Badge variant="outline" className="border-red-300 text-red-700">
              <XCircle className="w-3 h-3 mr-1" />
              Does Not Match
            </Badge>
          ) : null}
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-300 rounded-lg p-3">
          <div className="flex items-center">
            <XCircle className="w-5 h-5 text-red-600 mr-2" />
            <span className="text-red-800 text-sm">{error}</span>
          </div>
        </div>
      )}

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
        <p className="text-yellow-800 text-sm">
          <strong>Last chance:</strong> Once you click &quot;Execute Reset&quot;, all data will be permanently deleted.
        </p>
      </div>
    </div>
  );

  const renderExecutingStep = () => (
    <div className="space-y-6 text-center">
      <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
        <Spinner className="w-8 h-8 text-blue-600" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Resetting Database...
        </h3>
        <p className="text-gray-600">
          Please wait while all data is being deleted. This may take a few moments.
        </p>
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center justify-center">
          <Clock className="w-5 h-5 text-blue-600 mr-2" />
          <span className="text-blue-800 text-sm">
            Do not close this dialog or refresh the page
          </span>
        </div>
      </div>
    </div>
  );

  const renderCompleteStep = () => {
    if (!resetResult) return null;

    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
            resetResult.success ? 'bg-green-100' : 'bg-yellow-100'
          }`}>
            {resetResult.success ? (
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-yellow-600" />
            )}
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Database Reset {resetResult.success ? 'Completed' : 'Completed with Errors'}
          </h3>
          <p className="text-gray-600">
            {resetResult.message}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-2xl font-bold text-gray-900">
              {resetResult.summary.totalRecordsDeleted.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Records Deleted</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-2xl font-bold text-gray-900">
              {resetResult.summary.totalTablesProcessed}
            </div>
            <div className="text-sm text-gray-600">Tables Processed</div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="font-medium text-gray-900">Deletion Summary:</h4>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {Object.entries(resetResult.deletionResults).map(([table, result]) => (
              <div key={table} className="flex items-center justify-between text-sm">
                <span className="font-mono text-gray-700">{table}</span>
                {result.success ? (
                  <div className="flex items-center text-green-600">
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    <span>{result.deletedCount || 0} deleted</span>
                  </div>
                ) : (
                  <div className="flex items-center text-red-600">
                    <XCircle className="w-4 h-4 mr-1" />
                    <span>Failed</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-blue-800 text-sm">
            <strong>Next steps:</strong> You can now upload new documents and test the system with fresh data.
          </p>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Trash2 className="w-5 h-5 mr-2 text-red-600" />
            Database Reset
          </DialogTitle>
        </DialogHeader>

        {step === 'warning' && renderWarningStep()}
        {step === 'confirm' && renderConfirmStep()}
        {step === 'executing' && renderExecutingStep()}
        {step === 'complete' && renderCompleteStep()}

        <DialogFooter>
          {step === 'warning' && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button 
                onClick={handleContinueToConfirm}
                disabled={!understood}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                I Understand, Continue
              </Button>
            </>
          )}
          
          {step === 'confirm' && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button 
                onClick={handleExecuteReset}
                disabled={confirmationText !== 'DELETE ALL DATA'}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                <Skull className="w-4 h-4 mr-2" />
                Execute Reset
              </Button>
            </>
          )}
          
          {step === 'executing' && (
            <Button disabled className="bg-gray-400 cursor-not-allowed">
              <Spinner className="w-4 h-4 mr-2" />
              Resetting...
            </Button>
          )}
          
          {step === 'complete' && (
            <Button onClick={handleClose} className="bg-blue-600 hover:bg-blue-700">
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}