import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import type { ComparisonData } from '../../types';

interface ComparisonViewProps {
  comparisonData: ComparisonData;
  summary: string;
}

type TabType = 'sentiment' | 'features' | 'price' | 'mentions';

export function ComparisonView({ comparisonData, summary }: ComparisonViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>('sentiment');

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'sentiment', label: 'Sentiment', icon: '😊' },
    { id: 'features', label: 'Features', icon: '⚙️' },
    { id: 'price', label: 'Price', icon: '💰' },
    { id: 'mentions', label: 'Popularity', icon: '📊' },
  ];

  return (
    <div className="bg-glass backdrop-blur-md rounded-3xl shadow-glass-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border-light/30">
        <h3 className="text-lg font-semibold text-text-primary mb-1">
          Comparing {comparisonData.products.length} Products
        </h3>
        <p className="text-xs text-text-tertiary">
          {comparisonData.products.join(', ')}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border-light/30 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex-1 min-w-[80px] px-4 py-3 text-sm font-medium transition-all
              ${activeTab === tab.id
                ? 'text-accent-orange border-b-2 border-accent-orange bg-glass-light/50'
                : 'text-text-tertiary hover:text-text-primary hover:bg-glass-light/30'
              }
            `}
          >
            <span className="mr-1.5">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Chart Area */}
      <div className="p-6">
        {activeTab === 'sentiment' && <SentimentChart data={comparisonData.visualizations.sentiment} />}
        {activeTab === 'features' && <FeatureMatrix data={comparisonData.visualizations.features} />}
        {activeTab === 'price' && <PriceChart data={comparisonData.visualizations.prices} />}
        {activeTab === 'mentions' && <MentionChart data={comparisonData.visualizations.mentions} />}
      </div>

      {/* AI Summary */}
      <div className="p-4 bg-glass-light/50 border-t border-border-light/30">
        <h4 className="text-sm font-semibold text-text-primary mb-2">AI Summary</h4>
        <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
          {summary}
        </p>
      </div>
    </div>
  );
}

// Sentiment Chart Component
function SentimentChart({ data }: { data: ComparisonData['visualizations']['sentiment'] }) {
  const chartData = data.products.flatMap((product) => [
    {
      product: product.name,
      source: 'Reddit',
      positive: product.reddit.positive,
      negative: product.reddit.negative,
      neutral: product.reddit.neutral,
    },
    {
      product: product.name,
      source: 'YouTube',
      positive: product.youtube.positive,
      negative: product.youtube.negative,
      neutral: product.youtube.neutral,
    },
    {
      product: product.name,
      source: 'Expert Reviews',
      positive: product.expertReviews.positive,
      negative: product.expertReviews.negative,
      neutral: product.expertReviews.neutral,
    },
  ]);

  return (
    <div>
      <p className="text-xs text-text-tertiary mb-4">
        Sentiment breakdown by source (positive, neutral, negative)
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" opacity={0.3} />
          <XAxis
            dataKey="source"
            tick={{ fill: '#6B7280', fontSize: 11 }}
          />
          <YAxis
            tick={{ fill: '#6B7280', fontSize: 11 }}
            label={{ value: 'Percentage', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#6B7280' } }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(10px)',
              border: '1px solid #e0e0e0',
              borderRadius: '12px',
              fontSize: '12px',
            }}
          />
          <Legend wrapperStyle={{ fontSize: '11px' }} />
          <Bar dataKey="positive" fill="#10b981" stackId="a" />
          <Bar dataKey="neutral" fill="#f59e0b" stackId="a" />
          <Bar dataKey="negative" fill="#ef4444" stackId="a" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Feature Matrix Component
function FeatureMatrix({ data }: { data: ComparisonData['visualizations']['features'] }) {
  if (!data.features.length || !data.products.length) {
    return (
      <div className="text-center py-8 text-text-tertiary text-sm">
        No feature comparison data available
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-text-tertiary mb-4">
        Side-by-side feature comparison
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-light/30">
              <th className="text-left py-2 px-3 text-text-primary font-semibold">Feature</th>
              {data.products.map((product, idx) => (
                <th key={idx} className="text-left py-2 px-3 text-text-primary font-semibold">
                  {product}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.features.map((feature, featureIdx) => (
              <tr key={featureIdx} className="border-b border-border-light/20 hover:bg-glass-light/30">
                <td className="py-2 px-3 text-text-secondary font-medium">{feature}</td>
                {data.values.map((productValues, productIdx) => (
                  <td key={productIdx} className="py-2 px-3 text-text-primary">
                    {productValues[featureIdx] || 'N/A'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Price Chart Component
function PriceChart({ data }: { data: ComparisonData['visualizations']['prices'] }) {
  const chartData = data.products.map((p) => ({
    name: p.name.length > 20 ? p.name.slice(0, 20) + '...' : p.name,
    price: p.price || 0,
    retailer: p.retailer,
  }));

  const colors = ['#f97316', '#06b6d4', '#8b5cf6', '#10b981', '#f59e0b'];

  return (
    <div>
      <p className="text-xs text-text-tertiary mb-4">
        Price comparison across products
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} layout="horizontal">
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" opacity={0.3} />
          <XAxis
            type="number"
            tick={{ fill: '#6B7280', fontSize: 11 }}
            label={{ value: 'Price ($)', position: 'insideBottom', offset: -5, style: { fontSize: 11, fill: '#6B7280' } }}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: '#6B7280', fontSize: 10 }}
            width={100}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(10px)',
              border: '1px solid #e0e0e0',
              borderRadius: '12px',
              fontSize: '12px',
            }}
            formatter={(value: any) => [`$${value}`, 'Price']}
          />
          <Bar dataKey="price">
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-4 text-xs text-text-tertiary">
        {chartData.filter(d => d.price === 0).length > 0 && (
          <p>* Products with $0 indicate price unavailable</p>
        )}
      </div>
    </div>
  );
}

// Mention Chart Component
function MentionChart({ data }: { data: ComparisonData['visualizations']['mentions'] }) {
  const chartData = data.products.map((p) => ({
    name: p.name.length > 20 ? p.name.slice(0, 20) + '...' : p.name,
    mentions: p.totalMentions,
  }));

  const colors = ['#f97316', '#06b6d4', '#8b5cf6', '#10b981', '#f59e0b'];

  return (
    <div>
      <p className="text-xs text-text-tertiary mb-4">
        Total mentions across all sources
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" opacity={0.3} />
          <XAxis
            dataKey="name"
            tick={{ fill: '#6B7280', fontSize: 10 }}
            angle={-15}
            textAnchor="end"
            height={80}
          />
          <YAxis
            tick={{ fill: '#6B7280', fontSize: 11 }}
            label={{ value: 'Mentions', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#6B7280' } }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(10px)',
              border: '1px solid #e0e0e0',
              borderRadius: '12px',
              fontSize: '12px',
            }}
          />
          <Bar dataKey="mentions">
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
