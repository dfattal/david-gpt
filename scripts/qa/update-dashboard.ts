#!/usr/bin/env tsx

/**
 * Dashboard Data Updater
 *
 * Updates quality monitoring dashboard with latest metrics and visualizations
 * Generates dashboard components and data files
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

interface DashboardConfig {
  title: string;
  metrics: string[];
  timeRange: string;
  refreshInterval: number;
}

interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor: string;
    fill: boolean;
  }>;
}

class DashboardUpdater {
  private readonly dataPath = join(process.cwd(), 'qa-dashboard/data');
  private readonly componentsPath = join(process.cwd(), 'qa-dashboard/components');

  private readonly config: DashboardConfig = {
    title: 'David-GPT Quality Dashboard',
    metrics: ['overallScore', 'ragQuality', 'performance', 'testCoverage', 'buildSuccess'],
    timeRange: '30d',
    refreshInterval: 300000 // 5 minutes
  };

  /**
   * Update dashboard with latest data
   */
  async updateDashboard(): Promise<void> {
    console.log('📊 Updating quality dashboard...');

    const metrics = this.loadMetrics();
    const trends = this.loadTrends();
    const summary = this.loadSummary();

    // Generate chart data
    const chartData = this.generateChartData(metrics);

    // Generate dashboard HTML
    const dashboardHTML = this.generateDashboardHTML(chartData, trends, summary);

    // Generate React component (for future integration)
    const reactComponent = this.generateReactComponent(chartData, trends, summary);

    // Save files
    this.saveDashboardHTML(dashboardHTML);
    this.saveReactComponent(reactComponent);
    this.saveChartData(chartData);

    console.log('✅ Dashboard updated successfully');
  }

  /**
   * Load processed metrics
   */
  private loadMetrics(): any {
    try {
      const metricsPath = join(this.dataPath, 'metrics-history.json');
      if (existsSync(metricsPath)) {
        return JSON.parse(readFileSync(metricsPath, 'utf8'));
      }
    } catch (error) {
      console.warn('Could not load metrics:', error instanceof Error ? error.message : String(error));
    }
    return {};
  }

  /**
   * Load trends analysis
   */
  private loadTrends(): any[] {
    try {
      const trendsPath = join(this.dataPath, 'trends.json');
      if (existsSync(trendsPath)) {
        return JSON.parse(readFileSync(trendsPath, 'utf8'));
      }
    } catch (error) {
      console.warn('Could not load trends:', error instanceof Error ? error.message : String(error));
    }
    return [];
  }

  /**
   * Load summary statistics
   */
  private loadSummary(): any {
    try {
      const summaryPath = join(this.dataPath, 'summary.json');
      if (existsSync(summaryPath)) {
        return JSON.parse(readFileSync(summaryPath, 'utf8'));
      }
    } catch (error) {
      console.warn('Could not load summary:', error instanceof Error ? error.message : String(error));
    }
    return {};
  }

  /**
   * Generate chart data for visualization
   */
  private generateChartData(metrics: any): { [key: string]: ChartData } {
    const chartData: { [key: string]: ChartData } = {};

    this.config.metrics.forEach(metricName => {
      const dataPoints = metrics[metricName] || [];
      const recentData = dataPoints.slice(-30); // Last 30 days

      if (recentData.length === 0) return;

      const labels = recentData.map((dp: any) => {
        const date = new Date(dp.timestamp);
        return date.toLocaleDateString();
      });

      const values = recentData.map((dp: any) => dp.value);

      chartData[metricName] = {
        labels,
        datasets: [{
          label: this.formatMetricName(metricName),
          data: values,
          borderColor: this.getMetricColor(metricName),
          backgroundColor: this.getMetricColor(metricName, 0.1),
          fill: true
        }]
      };
    });

    return chartData;
  }

  /**
   * Format metric name for display
   */
  private formatMetricName(metricName: string): string {
    const names = {
      overallScore: 'Overall Quality Score',
      ragQuality: 'RAG Quality',
      performance: 'Performance Score',
      testCoverage: 'Test Coverage',
      buildSuccess: 'Build Success Rate',
      deploymentFrequency: 'Deployment Frequency'
    };

    return (names as any)[metricName] || metricName;
  }

  /**
   * Get color for metric visualization
   */
  private getMetricColor(metricName: string, alpha: number = 1): string {
    const colors = {
      overallScore: `rgba(59, 130, 246, ${alpha})`, // Blue
      ragQuality: `rgba(16, 185, 129, ${alpha})`, // Green
      performance: `rgba(245, 158, 11, ${alpha})`, // Amber
      testCoverage: `rgba(139, 92, 246, ${alpha})`, // Purple
      buildSuccess: `rgba(34, 197, 94, ${alpha})`, // Emerald
      deploymentFrequency: `rgba(236, 72, 153, ${alpha})` // Pink
    };

    return (colors as any)[metricName] || `rgba(107, 114, 128, ${alpha})`;
  }

  /**
   * Generate standalone HTML dashboard
   */
  private generateDashboardHTML(chartData: any, trends: any[], summary: any): string {
    const metricsHTML = Object.entries(chartData).map(([metric, data]: [string, any]) => {
      const latest = data.datasets[0].data[data.datasets[0].data.length - 1] || 0;
      const trend = trends.find(t => t.metric === metric);
      const trendIcon = trend?.trend === 'improving' ? '📈' : trend?.trend === 'declining' ? '📉' : '➖';

      return `
        <div class="metric-card">
          <h3>${this.formatMetricName(metric)}</h3>
          <div class="metric-value">${latest.toFixed(1)}</div>
          <div class="metric-trend">${trendIcon} ${trend?.changePercent || 0}%</div>
          <canvas id="chart-${metric}" width="400" height="200"></canvas>
        </div>
      `;
    }).join('');

    const alertsHTML = (summary.alerts || []).map((alert: any) => `
      <div class="alert alert-${alert.severity}">
        <strong>${alert.metric}:</strong> ${alert.message}
      </div>
    `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.config.title}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f8fafc;
        }
        .dashboard {
            max-width: 1400px;
            margin: 0 auto;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
        }
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        .metric-card {
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .metric-card h3 {
            margin: 0 0 10px 0;
            color: #374151;
            font-size: 14px;
            font-weight: 600;
        }
        .metric-value {
            font-size: 32px;
            font-weight: 700;
            color: #111827;
            margin-bottom: 5px;
        }
        .metric-trend {
            font-size: 14px;
            color: #6b7280;
        }
        .alerts {
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .alert {
            padding: 12px;
            margin-bottom: 10px;
            border-radius: 6px;
        }
        .alert-high {
            background-color: #fef2f2;
            border-left: 4px solid #ef4444;
            color: #991b1b;
        }
        .alert-medium {
            background-color: #fffbeb;
            border-left: 4px solid #f59e0b;
            color: #92400e;
        }
        .last-updated {
            text-align: center;
            color: #6b7280;
            font-size: 12px;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="dashboard">
        <div class="header">
            <h1>${this.config.title}</h1>
            <p>Real-time quality monitoring and analytics</p>
        </div>

        <div class="metrics-grid">
            ${metricsHTML}
        </div>

        ${alertsHTML ? `
        <div class="alerts">
            <h2>Quality Alerts</h2>
            ${alertsHTML}
        </div>
        ` : ''}

        <div class="last-updated">
            Last updated: ${new Date().toLocaleString()}
        </div>
    </div>

    <script>
        // Chart initialization
        const chartData = ${JSON.stringify(chartData)};

        Object.entries(chartData).forEach(([metric, data]) => {
            const ctx = document.getElementById('chart-' + metric);
            if (ctx) {
                new Chart(ctx, {
                    type: 'line',
                    data: data,
                    options: {
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
                    }
                });
            }
        });

        // Auto-refresh every 5 minutes
        setTimeout(() => {
            window.location.reload();
        }, ${this.config.refreshInterval});
    </script>
</body>
</html>`;
  }

  /**
   * Generate React component for integration
   */
  private generateReactComponent(chartData: any, trends: any[], summary: any): string {
    return `import React from 'react';
import { Line } from 'react-chartjs-2';

interface QualityDashboardProps {
  className?: string;
}

const QualityDashboard: React.FC<QualityDashboardProps> = ({ className }) => {
  const chartData = ${JSON.stringify(chartData, null, 2)};
  const trends = ${JSON.stringify(trends, null, 2)};
  const summary = ${JSON.stringify(summary, null, 2)};

  const formatMetricName = (metric: string): string => {
    const names = {
      overallScore: 'Overall Quality Score',
      ragQuality: 'RAG Quality',
      performance: 'Performance Score',
      testCoverage: 'Test Coverage',
      buildSuccess: 'Build Success Rate',
      deploymentFrequency: 'Deployment Frequency'
    };
    return names[metric] || metric;
  };

  const getTrendIcon = (trend: string): string => {
    switch (trend) {
      case 'improving': return '📈';
      case 'declining': return '📉';
      default: return '➖';
    }
  };

  return (
    <div className={\`quality-dashboard \${className || ''}\`}>
      <div className="dashboard-header">
        <h2>${this.config.title}</h2>
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
          {summary.alerts.map((alert, index) => (
            <div key={index} className={\`alert alert-\${alert.severity}\`}>
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

export default QualityDashboard;`;
  }

  /**
   * Save dashboard HTML
   */
  private saveDashboardHTML(html: string): void {
    const htmlPath = join(this.componentsPath, 'dashboard.html');
    writeFileSync(htmlPath, html, 'utf8');
  }

  /**
   * Save React component
   */
  private saveReactComponent(component: string): void {
    const componentPath = join(this.componentsPath, 'QualityDashboard.tsx');
    writeFileSync(componentPath, component, 'utf8');
  }

  /**
   * Save chart data for external use
   */
  private saveChartData(chartData: any): void {
    const chartDataPath = join(this.dataPath, 'chart-data.json');
    writeFileSync(chartDataPath, JSON.stringify(chartData, null, 2), 'utf8');
  }
}

/**
 * Main execution
 */
async function main() {
  const updater = new DashboardUpdater();

  try {
    await updater.updateDashboard();
    console.log('📊 Dashboard update completed successfully');

  } catch (error) {
    console.error('❌ Dashboard update failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { DashboardUpdater };