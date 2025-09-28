import React from 'react';
import { Line } from 'react-chartjs-2';

interface QualityDashboardProps {
  className?: string;
}

const QualityDashboard: React.FC<QualityDashboardProps> = ({ className }) => {
  const chartData = {
  "buildSuccess": {
    "labels": [
      "8/29/2025",
      "8/30/2025",
      "8/31/2025",
      "9/1/2025",
      "9/2/2025",
      "9/3/2025",
      "9/4/2025",
      "9/5/2025",
      "9/6/2025",
      "9/7/2025",
      "9/8/2025",
      "9/9/2025",
      "9/10/2025",
      "9/11/2025",
      "9/12/2025",
      "9/13/2025",
      "9/14/2025",
      "9/15/2025",
      "9/16/2025",
      "9/17/2025",
      "9/18/2025",
      "9/19/2025",
      "9/20/2025",
      "9/21/2025",
      "9/22/2025",
      "9/23/2025",
      "9/24/2025",
      "9/25/2025",
      "9/26/2025",
      "9/27/2025"
    ],
    "datasets": [
      {
        "label": "Build Success Rate",
        "data": [
          92.54402179396105,
          88.8753020428283,
          94.72952416476099,
          85.22087545059226,
          92.33203139496372,
          90.29378566715243,
          86.97538236506058,
          88.58753543269782,
          86.58732550735375,
          85.7055992205332,
          95.40524653031494,
          88.1880158172196,
          96.85555772640971,
          91.53069119771204,
          96.84597176716147,
          87.01741456762302,
          93.8750220401749,
          92.65680785308538,
          91.71084994722433,
          91.00725604438608,
          87.22645104593329,
          91.75742387707503,
          96.2648294980159,
          97.72428241298498,
          92.38112273793533,
          86.9874104148903,
          86.58462769958226,
          95.08964454311032,
          87.51594362071747,
          89.57865414483257
        ],
        "borderColor": "rgba(34, 197, 94, 1)",
        "backgroundColor": "rgba(34, 197, 94, 0.1)",
        "fill": true
      }
    ]
  }
};
  const trends = [
  {
    "metric": "buildSuccess",
    "trend": "stable",
    "changePercent": -1.3,
    "recommendation": "buildSuccess is stable - maintain current practices"
  }
];
  const summary = {
  "lastUpdated": "2025-09-28T03:06:46.118Z",
  "dataPoints": 31,
  "averageScores": {
    "buildSuccess": 90.8,
    "deploymentFrequency": 3.7
  },
  "trends": {
    "improving": 0,
    "declining": 0,
    "stable": 1
  },
  "alerts": [],
  "recommendations": [
    "buildSuccess is stable - maintain current practices"
  ]
};

  const formatMetricName = (metric: string): string => {
    const names = {
      overallScore: 'Overall Quality Score',
      ragQuality: 'RAG Quality',
      performance: 'Performance Score',
      testCoverage: 'Test Coverage',
      buildSuccess: 'Build Success Rate',
      deploymentFrequency: 'Deployment Frequency'
    };
    return (names as any)[metric] || metric;
  };

  const getTrendIcon = (trend: string): string => {
    switch (trend) {
      case 'improving': return '📈';
      case 'declining': return '📉';
      default: return '➖';
    }
  };

  return (
    <div className={`quality-dashboard ${className || ''}`}>
      <div className="dashboard-header">
        <h2>David-GPT Quality Dashboard</h2>
        <p>Real-time quality monitoring and analytics</p>
      </div>

      <div className="metrics-grid">
        {Object.entries(chartData).map(([metric, data]: [string, any]) => {
          const latest = data.datasets[0].data[data.datasets[0].data.length - 1] || 0;
          const trend = trends.find(t => t.metric === metric);

          return (
            <div key={metric} className="metric-card">
              <h3>{formatMetricName(metric)}</h3>
              <div className="metric-value">{latest.toFixed(1)}</div>
              <div className="metric-trend">
                {getTrendIcon(trend?.trend || 'stable')} {trend?.changePercent || 0}%
              </div>
              <div className="chart-container">
                <Line
                  data={data}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: {
                        beginAtZero: true,
                        max: 100
                      }
                    },
                    plugins: {
                      legend: {
                        display: false
                      }
                    }
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {summary.alerts && summary.alerts.length > 0 && (
        <div className="alerts-section">
          <h3>Quality Alerts</h3>
          {summary.alerts.map((alert: any, index) => (
            <div key={index} className={`alert alert-${alert.severity}`}>
              <strong>{alert.metric}:</strong> {alert.message}
            </div>
          ))}
        </div>
      )}

      <div className="last-updated">
        Last updated: {new Date().toLocaleString()}
      </div>
    </div>
  );
};

export default QualityDashboard;