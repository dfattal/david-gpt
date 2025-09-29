"use client";

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { 
  AlertTriangle, 
  CheckCircle2, 
  AlertCircle,
  TrendingUp,
  Users,
  Network,
  Database,
  Merge,
  Trash2,
  Eye,
  RefreshCw,
  BarChart3,
  PieChart,
  ArrowRight
} from 'lucide-react';

interface QualityMetrics {
  overview: {
    totalEntities: number;
    totalRelationships: number;
    totalAliases: number;
    entityDistribution: Record<string, number>;
    relationshipDistribution: Record<string, number>;
  };
  issues: {
    orphanedEntities: {
      count: number;
      entities?: Array<{
        id: string;
        name: string;
        kind: string;
        authority_score: number;
      }>;
    };
    potentialDuplicates: {
      count: number;
      duplicates?: Array<{
        entities: Array<{
          id: string;
          name: string;
          kind: string;
          authority_score: number;
        }>;
        similarity: number;
      }>;
    };
    lowAuthorityEntities: {
      count: number;
      entities?: Array<{
        id: string;
        name: string;
        kind: string;
        authority_score: number;
        mention_count: number;
      }>;
    };
    entitiesWithoutAliases: {
      count: number;
    };
    weakRelationships: {
      count: number;
      relationships?: Array<{
        id: string;
        rel: string;
        weight: number;
        evidence_text?: string;
        src_entity: { name: string; kind: string };
        dst_entity: { name: string; kind: string };
      }>;
    };
  };
  recommendations: string[];
}

const KIND_COLORS: Record<string, string> = {
  person: 'bg-blue-100 text-blue-800',
  organization: 'bg-green-100 text-green-800',
  product: 'bg-purple-100 text-purple-800',
  technology: 'bg-orange-100 text-orange-800',
  component: 'bg-red-100 text-red-800',
  document: 'bg-gray-100 text-gray-800',
};

const RELATION_COLORS: Record<string, string> = {
  author_of: 'bg-blue-100 text-blue-800',
  inventor_of: 'bg-green-100 text-green-800',
  assignee_of: 'bg-purple-100 text-purple-800',
  cites: 'bg-yellow-100 text-yellow-800',
  supersedes: 'bg-red-100 text-red-800',
  implements: 'bg-indigo-100 text-indigo-800',
  used_in: 'bg-pink-100 text-pink-800',
  similar_to: 'bg-gray-100 text-gray-800',
  enables_3d: 'bg-cyan-100 text-cyan-800',
  uses_component: 'bg-orange-100 text-orange-800',
  competing_with: 'bg-red-200 text-red-900',
  integrates_with: 'bg-green-200 text-green-900',
  can_use: 'bg-blue-200 text-blue-900',
  enhances: 'bg-purple-200 text-purple-900',
  evolved_to: 'bg-amber-100 text-amber-800',
  alternative_to: 'bg-slate-100 text-slate-800',
};

export function KGQualityDashboard() {
  const [metrics, setMetrics] = useState<QualityMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Load quality metrics
  const loadMetrics = async (includeDetails = false) => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      if (includeDetails) params.set('details', 'true');

      const response = await fetch(`/api/admin/kg/quality?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token') || 'dummy_token'}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to load quality metrics: ${response.statusText}`);
      }

      const data = await response.json();
      setMetrics(data);
      setShowDetails(includeDetails);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quality metrics');
      console.error('Error loading quality metrics:', err);
    } finally {
      setLoading(false);
      setLoadingDetails(false);
    }
  };

  // Load detailed metrics
  const loadDetailedMetrics = async () => {
    setLoadingDetails(true);
    await loadMetrics(true);
  };

  // Refresh metrics
  const refreshMetrics = () => {
    loadMetrics(showDetails);
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  // Calculate quality score
  const calculateQualityScore = (metrics: QualityMetrics): number => {
    if (!metrics.overview.totalEntities) return 100;
    
    const orphanedRatio = metrics.issues.orphanedEntities.count / metrics.overview.totalEntities;
    const duplicateRatio = metrics.issues.potentialDuplicates.count / metrics.overview.totalEntities;
    const lowAuthorityRatio = metrics.issues.lowAuthorityEntities.count / metrics.overview.totalEntities;
    const noAliasRatio = metrics.issues.entitiesWithoutAliases.count / metrics.overview.totalEntities;
    
    const qualityScore = 100 - (
      (orphanedRatio * 30) + 
      (duplicateRatio * 25) + 
      (lowAuthorityRatio * 20) + 
      (noAliasRatio * 15) +
      (metrics.issues.weakRelationships.count / Math.max(metrics.overview.totalRelationships, 1) * 10)
    );
    
    return Math.max(0, Math.round(qualityScore));
  };

  const getQualityScoreColor = (score: number): string => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getQualityScoreBg = (score: number): string => {
    if (score >= 80) return 'bg-green-100';
    if (score >= 60) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner className="w-8 h-8 mr-2" />
        <span>Loading quality metrics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-6 border-red-200 bg-red-50">
        <div className="flex items-center">
          <AlertCircle className="w-6 h-6 text-red-600 mr-3" />
          <div>
            <h3 className="font-medium text-red-900">Error Loading Quality Metrics</h3>
            <p className="text-red-700 mt-1">{error}</p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => loadMetrics()}
              className="mt-3"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  if (!metrics) return null;

  const qualityScore = calculateQualityScore(metrics);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Knowledge Graph Quality</h1>
          <p className="text-gray-600 mt-1">
            Monitor and improve the quality of your knowledge graph
          </p>
        </div>
        <div className="flex space-x-2">
          <Button 
            variant="outline" 
            onClick={refreshMetrics}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {!showDetails && (
            <Button 
              onClick={loadDetailedMetrics}
              disabled={loadingDetails}
            >
              {loadingDetails ? (
                <Spinner className="w-4 h-4 mr-2" />
              ) : (
                <Eye className="w-4 h-4 mr-2" />
              )}
              Load Details
            </Button>
          )}
        </div>
      </div>

      {/* Quality Score Card */}
      <Card className={`p-6 ${getQualityScoreBg(qualityScore)}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Overall Quality Score</h2>
            <div className="flex items-center mt-2">
              <span className={`text-4xl font-bold ${getQualityScoreColor(qualityScore)}`}>
                {qualityScore}%
              </span>
              {qualityScore >= 80 ? (
                <CheckCircle2 className="w-6 h-6 text-green-600 ml-3" />
              ) : qualityScore >= 60 ? (
                <AlertTriangle className="w-6 h-6 text-yellow-600 ml-3" />
              ) : (
                <AlertCircle className="w-6 h-6 text-red-600 ml-3" />
              )}
            </div>
            <p className="text-gray-700 mt-1">
              {qualityScore >= 80 ? 'Excellent quality - minimal issues detected' :
               qualityScore >= 60 ? 'Good quality - some improvements recommended' :
               'Needs attention - multiple quality issues detected'}
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600">Last updated</div>
            <div className="text-sm font-medium text-gray-900">
              {new Date().toLocaleString()}
            </div>
          </div>
        </div>
      </Card>

      {/* Overview Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center">
            <Database className="w-8 h-8 text-blue-600" />
            <div className="ml-3">
              <div className="text-2xl font-bold text-gray-900">
                {metrics.overview.totalEntities.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600">Total Entities</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center">
            <Network className="w-8 h-8 text-green-600" />
            <div className="ml-3">
              <div className="text-2xl font-bold text-gray-900">
                {metrics.overview.totalRelationships.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600">Relationships</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center">
            <Users className="w-8 h-8 text-purple-600" />
            <div className="ml-3">
              <div className="text-2xl font-bold text-gray-900">
                {metrics.overview.totalAliases.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600">Aliases</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center">
            <TrendingUp className="w-8 h-8 text-orange-600" />
            <div className="ml-3">
              <div className="text-2xl font-bold text-gray-900">
                {Object.keys(metrics.overview.entityDistribution).length}
              </div>
              <div className="text-sm text-gray-600">Entity Types</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Entity Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center mb-4">
            <PieChart className="w-5 h-5 text-gray-700 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">Entity Distribution</h3>
          </div>
          <div className="space-y-3">
            {Object.entries(metrics.overview.entityDistribution)
              .sort(([,a], [,b]) => b - a)
              .map(([kind, count]) => (
                <div key={kind} className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Badge className={KIND_COLORS[kind] || 'bg-gray-100 text-gray-800'}>
                      {kind}
                    </Badge>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-24 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ 
                          width: `${(count / metrics.overview.totalEntities) * 100}%` 
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-12 text-right">
                      {count}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center mb-4">
            <BarChart3 className="w-5 h-5 text-gray-700 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">Relationship Types</h3>
          </div>
          <div className="space-y-3">
            {Object.entries(metrics.overview.relationshipDistribution)
              .sort(([,a], [,b]) => b - a)
              .slice(0, 8)
              .map(([rel, count]) => (
                <div key={rel} className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Badge className={RELATION_COLORS[rel] || 'bg-gray-100 text-gray-800'}>
                      {rel.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-24 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full"
                        style={{ 
                          width: `${(count / metrics.overview.totalRelationships) * 100}%` 
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-12 text-right">
                      {count}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </Card>
      </div>

      {/* Quality Issues */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quality Issues</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Orphaned Entities */}
          <div className="p-4 border rounded-lg bg-yellow-50 border-yellow-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
                <span className="ml-2 font-medium text-yellow-900">Orphaned Entities</span>
              </div>
              <Badge variant="outline" className="text-yellow-800 border-yellow-300">
                {metrics.issues.orphanedEntities.count}
              </Badge>
            </div>
            <p className="text-sm text-yellow-700">
              Entities with no relationships to other entities
            </p>
          </div>

          {/* Potential Duplicates */}
          <div className="p-4 border rounded-lg bg-red-50 border-red-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <Merge className="w-5 h-5 text-red-600" />
                <span className="ml-2 font-medium text-red-900">Potential Duplicates</span>
              </div>
              <Badge variant="outline" className="text-red-800 border-red-300">
                {metrics.issues.potentialDuplicates.count}
              </Badge>
            </div>
            <p className="text-sm text-red-700">
              Entities with similar names that might be duplicates
            </p>
          </div>

          {/* Low Authority Entities */}
          <div className="p-4 border rounded-lg bg-orange-50 border-orange-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <TrendingUp className="w-5 h-5 text-orange-600" />
                <span className="ml-2 font-medium text-orange-900">Low Authority</span>
              </div>
              <Badge variant="outline" className="text-orange-800 border-orange-300">
                {metrics.issues.lowAuthorityEntities.count}
              </Badge>
            </div>
            <p className="text-sm text-orange-700">
              Entities with authority scores below 30%
            </p>
          </div>

          {/* Entities Without Aliases */}
          <div className="p-4 border rounded-lg bg-blue-50 border-blue-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <Users className="w-5 h-5 text-blue-600" />
                <span className="ml-2 font-medium text-blue-900">No Aliases</span>
              </div>
              <Badge variant="outline" className="text-blue-800 border-blue-300">
                {metrics.issues.entitiesWithoutAliases.count}
              </Badge>
            </div>
            <p className="text-sm text-blue-700">
              Entities without alternative names or aliases
            </p>
          </div>

          {/* Weak Relationships */}
          <div className="p-4 border rounded-lg bg-purple-50 border-purple-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <Network className="w-5 h-5 text-purple-600" />
                <span className="ml-2 font-medium text-purple-900">Weak Relationships</span>
              </div>
              <Badge variant="outline" className="text-purple-800 border-purple-300">
                {metrics.issues.weakRelationships.count}
              </Badge>
            </div>
            <p className="text-sm text-purple-700">
              Relationships with confidence below 40%
            </p>
          </div>
        </div>
      </Card>

      {/* Detailed Issues (only shown when details are loaded) */}
      {showDetails && metrics.issues.potentialDuplicates.duplicates && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Potential Duplicates (Top 10)</h3>
          <div className="space-y-4">
            {metrics.issues.potentialDuplicates.duplicates.slice(0, 10).map((duplicate, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                <div className="flex items-center space-x-4">
                  <Badge className="bg-red-100 text-red-800">
                    {Math.round(duplicate.similarity * 100)}% similar
                  </Badge>
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center space-x-1">
                      <span className="font-medium">{duplicate.entities[0].name}</span>
                      <Badge className={KIND_COLORS[duplicate.entities[0].kind]}>
                        {duplicate.entities[0].kind}
                      </Badge>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                    <div className="flex items-center space-x-1">
                      <span className="font-medium">{duplicate.entities[1].name}</span>
                      <Badge className={KIND_COLORS[duplicate.entities[1].kind]}>
                        {duplicate.entities[1].kind}
                      </Badge>
                    </div>
                  </div>
                </div>
                <Button size="sm" variant="outline">
                  <Merge className="w-4 h-4 mr-2" />
                  Review Merge
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recommendations */}
      {metrics.recommendations.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recommendations</h3>
          <div className="space-y-2">
            {metrics.recommendations.map((recommendation, index) => (
              <div key={index} className="flex items-start">
                <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" />
                <span className="text-gray-700">{recommendation}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}