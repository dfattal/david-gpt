#!/usr/bin/env tsx

/**
 * Alert Manager
 *
 * Intelligent alerting system for quality monitoring
 * Handles Slack notifications, email alerts, and escalation policies
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

interface Alert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'quality' | 'performance' | 'security' | 'reliability';
  metric: string;
  message: string;
  value: number;
  threshold: number;
  timestamp: string;
  status: 'new' | 'acknowledged' | 'resolved' | 'suppressed';
  escalated: boolean;
}

interface AlertRule {
  metric: string;
  condition: 'above' | 'below' | 'change';
  threshold: number;
  severity: string;
  cooldown: number; // minutes
  escalation: {
    after: number; // minutes
    to: string[];
  };
}

interface NotificationChannel {
  type: 'slack' | 'email' | 'webhook';
  url: string;
  severity: string[];
  enabled: boolean;
}

class AlertManager {
  private readonly dataPath = join(process.cwd(), 'qa-dashboard/data');
  private readonly alertsPath = join(this.dataPath, 'alerts.json');
  private readonly rulesPath = join(this.dataPath, 'alert-rules.json');

  private alerts: Alert[] = [];
  private rules: AlertRule[] = [];
  private channels: NotificationChannel[] = [];

  constructor() {
    this.loadAlerts();
    this.loadRules();
    this.initializeChannels();
  }

  /**
   * Process metrics and generate alerts
   */
  async processAlerts(): Promise<void> {
    console.log('🚨 Processing alerts...');

    const metrics = this.loadLatestMetrics();
    const trends = this.loadTrends();

    // Check for threshold violations
    await this.checkThresholds(metrics);

    // Check for trend-based alerts
    await this.checkTrends(trends);

    // Process escalations
    await this.processEscalations();

    // Send notifications
    await this.sendNotifications();

    // Clean up old alerts
    this.cleanupAlerts();

    // Save updated alerts
    this.saveAlerts();

    console.log(`✅ Alert processing completed - ${this.getActiveAlerts().length} active alerts`);
  }

  /**
   * Check metric thresholds against rules
   */
  private async checkThresholds(metrics: any): Promise<void> {
    for (const rule of this.rules) {
      const metricValue = this.extractMetricValue(metrics, rule.metric);
      if (metricValue === null) continue;

      const shouldAlert = this.evaluateCondition(metricValue, rule.condition, rule.threshold);

      if (shouldAlert) {
        const existingAlert = this.findExistingAlert(rule.metric, 'threshold');

        if (!existingAlert && this.isOutsideCooldown(rule)) {
          await this.createAlert({
            severity: rule.severity as Alert['severity'],
            category: this.getMetricCategory(rule.metric),
            metric: rule.metric,
            message: this.generateAlertMessage(rule, metricValue),
            value: metricValue,
            threshold: rule.threshold,
            escalated: false
          });
        }
      } else {
        // Resolve existing alerts if condition no longer met
        const existingAlert = this.findExistingAlert(rule.metric, 'threshold');
        if (existingAlert && existingAlert.status !== 'resolved') {
          existingAlert.status = 'resolved';
        }
      }
    }
  }

  /**
   * Check trend-based alerts
   */
  private async checkTrends(trends: any[]): Promise<void> {
    for (const trend of trends) {
      if (trend.trend === 'declining' && Math.abs(trend.changePercent) > 15) {
        const existingAlert = this.findExistingAlert(trend.metric, 'trend');

        if (!existingAlert) {
          await this.createAlert({
            severity: Math.abs(trend.changePercent) > 25 ? 'high' : 'medium',
            category: 'quality',
            metric: trend.metric,
            message: `${trend.metric} trending down by ${Math.abs(trend.changePercent).toFixed(1)}%`,
            value: trend.changePercent,
            threshold: -15,
            escalated: false
          });
        }
      }
    }
  }

  /**
   * Process alert escalations
   */
  private async processEscalations(): Promise<void> {
    const now = new Date();

    for (const alert of this.alerts) {
      if (alert.status === 'new' && !alert.escalated) {
        const rule = this.rules.find(r => r.metric === alert.metric);
        if (!rule) continue;

        const alertAge = now.getTime() - new Date(alert.timestamp).getTime();
        const escalationTime = rule.escalation.after * 60 * 1000; // Convert to ms

        if (alertAge > escalationTime) {
          alert.escalated = true;
          await this.sendEscalation(alert, rule.escalation.to);
        }
      }
    }
  }

  /**
   * Send notifications for new and escalated alerts
   */
  private async sendNotifications(): Promise<void> {
    const newAlerts = this.alerts.filter(a => a.status === 'new');
    const escalatedAlerts = this.alerts.filter(a => a.escalated && a.status !== 'resolved');

    for (const alert of newAlerts) {
      await this.sendAlert(alert);
      // Mark as acknowledged after sending
      if (alert.severity !== 'critical') {
        alert.status = 'acknowledged';
      }
    }

    for (const alert of escalatedAlerts) {
      await this.sendEscalationAlert(alert);
    }
  }

  /**
   * Create a new alert
   */
  private async createAlert(alertData: Partial<Alert>): Promise<void> {
    const alert: Alert = {
      id: this.generateAlertId(),
      severity: alertData.severity || 'medium',
      category: alertData.category || 'quality',
      metric: alertData.metric || '',
      message: alertData.message || '',
      value: alertData.value || 0,
      threshold: alertData.threshold || 0,
      timestamp: new Date().toISOString(),
      status: 'new',
      escalated: false,
      ...alertData
    };

    this.alerts.push(alert);
    console.log(`🚨 Created ${alert.severity} alert: ${alert.message}`);
  }

  /**
   * Send alert notification
   */
  private async sendAlert(alert: Alert): Promise<void> {
    const eligibleChannels = this.channels.filter(
      channel => channel.enabled && channel.severity.includes(alert.severity)
    );

    for (const channel of eligibleChannels) {
      try {
        await this.sendToChannel(channel, this.formatAlertMessage(alert));
      } catch (error) {
        console.error(`Failed to send alert to ${channel.type}:`, error instanceof Error ? error.message : String(error));
      }
    }
  }

  /**
   * Send escalation notification
   */
  private async sendEscalation(alert: Alert, recipients: string[]): Promise<void> {
    const message = this.formatEscalationMessage(alert);

    // For now, log escalation (in real implementation, would send to specific recipients)
    console.log(`🔥 ESCALATION: ${alert.message}`);
    console.log(`Recipients: ${recipients.join(', ')}`);

    // Send to critical channels
    const criticalChannels = this.channels.filter(
      channel => channel.enabled && channel.severity.includes('critical')
    );

    for (const channel of criticalChannels) {
      try {
        await this.sendToChannel(channel, message);
      } catch (error) {
        console.error(`Failed to send escalation to ${channel.type}:`, error instanceof Error ? error.message : String(error));
      }
    }
  }

  /**
   * Send escalated alert notification
   */
  private async sendEscalationAlert(alert: Alert): Promise<void> {
    // Only send escalation notifications for critical unresolved alerts
    if (alert.severity === 'critical' && alert.status !== 'resolved') {
      await this.sendEscalation(alert, ['oncall', 'leads']);
    }
  }

  /**
   * Send message to notification channel
   */
  private async sendToChannel(channel: NotificationChannel, message: string): Promise<void> {
    switch (channel.type) {
      case 'slack':
        await this.sendToSlack(channel.url, message);
        break;
      case 'webhook':
        await this.sendToWebhook(channel.url, message);
        break;
      default:
        console.log(`Unsupported channel type: ${channel.type}`);
    }
  }

  /**
   * Send message to Slack
   */
  private async sendToSlack(webhookUrl: string, message: string): Promise<void> {
    if (!webhookUrl) {
      console.log('Slack webhook not configured, skipping notification');
      return;
    }

    const payload = {
      text: message,
      username: 'QA Alert Bot',
      icon_emoji: ':warning:'
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Slack notification failed: ${response.statusText}`);
    }
  }

  /**
   * Send message to webhook
   */
  private async sendToWebhook(url: string, message: string): Promise<void> {
    const payload = { message, timestamp: new Date().toISOString() };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Webhook notification failed: ${response.statusText}`);
    }
  }

  /**
   * Format alert message for notifications
   */
  private formatAlertMessage(alert: Alert): string {
    const severityEmoji = {
      low: 'ℹ️',
      medium: '⚠️',
      high: '🚨',
      critical: '🔥'
    };

    return `${severityEmoji[alert.severity]} **${alert.severity.toUpperCase()} ALERT**

**Metric:** ${alert.metric}
**Message:** ${alert.message}
**Value:** ${alert.value}
**Threshold:** ${alert.threshold}
**Time:** ${new Date(alert.timestamp).toLocaleString()}

Please investigate immediately.`;
  }

  /**
   * Format escalation message
   */
  private formatEscalationMessage(alert: Alert): string {
    const timeSinceAlert = new Date().getTime() - new Date(alert.timestamp).getTime();
    const minutesAgo = Math.floor(timeSinceAlert / (1000 * 60));

    return `🔥 **ESCALATED ALERT** 🔥

The following alert has been escalated due to no response:

**Metric:** ${alert.metric}
**Message:** ${alert.message}
**Severity:** ${alert.severity.toUpperCase()}
**First Detected:** ${minutesAgo} minutes ago
**Value:** ${alert.value}
**Threshold:** ${alert.threshold}

**IMMEDIATE ACTION REQUIRED**`;
  }

  /**
   * Helper methods
   */
  private loadLatestMetrics(): any {
    try {
      const metricsPath = join(this.dataPath, 'metrics-latest.json');
      if (existsSync(metricsPath)) {
        return JSON.parse(readFileSync(metricsPath, 'utf8'));
      }
    } catch (error) {
      console.warn('Could not load latest metrics:', error instanceof Error ? error.message : String(error));
    }
    return {};
  }

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

  private loadAlerts(): void {
    try {
      if (existsSync(this.alertsPath)) {
        this.alerts = JSON.parse(readFileSync(this.alertsPath, 'utf8'));
      }
    } catch (error) {
      console.warn('Could not load alerts:', error instanceof Error ? error.message : String(error));
      this.alerts = [];
    }
  }

  private loadRules(): void {
    try {
      if (existsSync(this.rulesPath)) {
        this.rules = JSON.parse(readFileSync(this.rulesPath, 'utf8'));
      } else {
        this.initializeDefaultRules();
      }
    } catch (error) {
      console.warn('Could not load alert rules:', error instanceof Error ? error.message : String(error));
      this.initializeDefaultRules();
    }
  }

  private initializeDefaultRules(): void {
    this.rules = [
      {
        metric: 'overallScore',
        condition: 'below',
        threshold: 70,
        severity: 'high',
        cooldown: 30,
        escalation: { after: 60, to: ['oncall'] }
      },
      {
        metric: 'ragQuality',
        condition: 'below',
        threshold: 75,
        severity: 'medium',
        cooldown: 60,
        escalation: { after: 120, to: ['team-leads'] }
      },
      {
        metric: 'performance',
        condition: 'below',
        threshold: 80,
        severity: 'medium',
        cooldown: 30,
        escalation: { after: 90, to: ['devops'] }
      },
      {
        metric: 'buildSuccess',
        condition: 'below',
        threshold: 90,
        severity: 'high',
        cooldown: 15,
        escalation: { after: 30, to: ['oncall', 'devops'] }
      }
    ];
    this.saveRules();
  }

  private initializeChannels(): void {
    this.channels = [
      {
        type: 'slack',
        url: process.env.SLACK_WEBHOOK || '',
        severity: ['medium', 'high', 'critical'],
        enabled: !!process.env.SLACK_WEBHOOK
      }
    ];
  }

  private saveAlerts(): void {
    writeFileSync(this.alertsPath, JSON.stringify(this.alerts, null, 2), 'utf8');
  }

  private saveRules(): void {
    writeFileSync(this.rulesPath, JSON.stringify(this.rules, null, 2), 'utf8');
  }

  private extractMetricValue(metrics: any, metricName: string): number | null {
    const metric = metrics[metricName];
    return metric?.value || null;
  }

  private evaluateCondition(value: number, condition: string, threshold: number): boolean {
    switch (condition) {
      case 'above': return value > threshold;
      case 'below': return value < threshold;
      case 'change': return Math.abs(value) > threshold;
      default: return false;
    }
  }

  private findExistingAlert(metric: string, type: string): Alert | undefined {
    return this.alerts.find(alert =>
      alert.metric === metric &&
      alert.status !== 'resolved' &&
      alert.message.includes(type)
    );
  }

  private isOutsideCooldown(rule: AlertRule): boolean {
    const lastAlert = this.alerts
      .filter(alert => alert.metric === rule.metric)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

    if (!lastAlert) return true;

    const timeSinceLastAlert = new Date().getTime() - new Date(lastAlert.timestamp).getTime();
    const cooldownMs = rule.cooldown * 60 * 1000;

    return timeSinceLastAlert > cooldownMs;
  }

  private getMetricCategory(metric: string): Alert['category'] {
    if (metric.includes('performance') || metric.includes('response')) return 'performance';
    if (metric.includes('security') || metric.includes('vulnerability')) return 'security';
    if (metric.includes('build') || metric.includes('deploy')) return 'reliability';
    return 'quality';
  }

  private generateAlertMessage(rule: AlertRule, value: number): string {
    return `${rule.metric} ${rule.condition} threshold (${value} ${rule.condition} ${rule.threshold})`;
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getActiveAlerts(): Alert[] {
    return this.alerts.filter(alert => alert.status !== 'resolved');
  }

  private cleanupAlerts(): void {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    this.alerts = this.alerts.filter(alert =>
      alert.status !== 'resolved' || new Date(alert.timestamp) > oneWeekAgo
    );
  }
}

/**
 * Main execution
 */
async function main() {
  const manager = new AlertManager();

  try {
    await manager.processAlerts();
    console.log('🚨 Alert processing completed successfully');

  } catch (error) {
    console.error('❌ Alert processing failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { AlertManager };