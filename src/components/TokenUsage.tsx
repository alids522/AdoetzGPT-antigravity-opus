import { useState, useEffect, useMemo, useCallback } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Trash2, RotateCw, Plus, X, Calendar, TrendingUp, ChevronDown, Filter, MoreHorizontal, Edit2, Check } from 'lucide-react';
import { translations, Language, normalizeLanguage } from '../translations';

interface TokenUsageData {
  timestamp: number;
  model: string;
  endpoint: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface CustomCounter {
  id: string;
  name: string;
  createdAt: number;
  color: string;
}

interface TokenUsageProps {
  language: Language;
  usageData: TokenUsageData[];
  onResetUsage?: () => void;
  customCounters: CustomCounter[];
  setCustomCounters: React.Dispatch<React.SetStateAction<CustomCounter[]>>;
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6'];

export function TokenUsage({ language, usageData, onResetUsage, customCounters, setCustomCounters }: TokenUsageProps) {
  const safeLanguage = normalizeLanguage(language);
  const t = translations[safeLanguage].tokenUsage || {
    title: 'Token Usage',
    totalTokens: 'Total Tokens',
    inputTokens: 'Input Tokens',
    outputTokens: 'Output Tokens',
    today: 'Today',
    thisWeek: 'This Week',
    thisMonth: 'This Month',
    allTime: 'All Time',
    reset: 'Reset',
    resetConfirm: 'Are you sure you want to reset all usage data?',
    noData: 'No usage data available',
    byModel: 'By Model',
    byEndpoint: 'By Endpoint',
    overTime: 'Usage Over Time',
    perDay: 'Per Day',
    customRange: 'Custom Range',
    selectModel: 'Select Model',
    selectEndpoint: 'Select Endpoint',
    allModels: 'All Models',
    allEndpoints: 'All Endpoints',
    fromDate: 'From',
    toDate: 'To',
    customCounters: 'Custom Counters',
    createCounter: 'New Counter',
    counterName: 'Counter Name',
    deleteCounter: 'Delete',
    deleteConfirm: 'Delete this counter?',
    resetCounter: 'Reset',
    resetCounterConfirm: 'Reset this counter?',
    activeSince: 'Active since',
    rename: 'Rename',
  };

  // Main filter states
  const [timeFilter, setTimeFilter] = useState<'today' | 'week' | 'month' | 'all' | 'custom'>('all');
  const [groupBy, setGroupBy] = useState<'model' | 'endpoint'>('model');
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie'>('bar');
  const [confirmReset, setConfirmReset] = useState(false);

  // Model and endpoint filters
  const [selectedModel, setSelectedModel] = useState<string>('all');
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>('all');

  // Custom date range
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Custom counters UI state
  const [showCreateCounterModal, setShowCreateCounterModal] = useState(false);
  const [newCounterName, setNewCounterName] = useState('');
  const [expandedCounterId, setExpandedCounterId] = useState<string | null>(null);
  const [editingCounterId, setEditingCounterId] = useState<string | null>(null);
  const [editingCounterName, setEditingCounterName] = useState('');

  // Get unique models and endpoints from data
  const { uniqueModels, uniqueEndpoints } = useMemo(() => {
    const models = new Set<string>();
    const endpoints = new Set<string>();
    usageData.forEach(d => {
      models.add(d.model);
      endpoints.add(d.endpoint);
    });
    return {
      uniqueModels: Array.from(models).sort(),
      uniqueEndpoints: Array.from(endpoints).sort(),
    };
  }, [usageData]);

  // Get filter date range
  const getDateRange = useMemo(() => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    switch (timeFilter) {
      case 'today':
        return { start: now - day, end: now };
      case 'week':
        return { start: now - (7 * day), end: now };
      case 'month':
        return { start: now - (30 * day), end: now };
      case 'custom':
        if (customStartDate && customEndDate) {
          const start = new Date(customStartDate).getTime();
          const end = new Date(customEndDate);
          end.setHours(23, 59, 59, 999);
          return { start, end: end.getTime() };
        }
        return { start: now - (30 * day), end: now };
      default:
        return { start: 0, end: now };
    }
  }, [timeFilter, customStartDate, customEndDate]);

  // Filter data by time period and model/endpoint
  const filteredData = useMemo(() => {
    let filtered = usageData.filter(d => {
      const inDateRange = d.timestamp >= getDateRange.start && d.timestamp <= getDateRange.end;
      const matchesModel = selectedModel === 'all' || d.model === selectedModel;
      const matchesEndpoint = selectedEndpoint === 'all' || d.endpoint === selectedEndpoint;
      return inDateRange && matchesModel && matchesEndpoint;
    });

    return filtered;
  }, [usageData, getDateRange, selectedModel, selectedEndpoint]);

  // Group by model or endpoint for bar chart
  const groupedData = useMemo(() => {
    const groups: Record<string, { input: number; output: number; total: number }> = {};

    filteredData.forEach(d => {
      const key = groupBy === 'model' ? d.model : d.endpoint;
      if (!groups[key]) {
        groups[key] = { input: 0, output: 0, total: 0 };
      }
      groups[key].input += d.inputTokens;
      groups[key].output += d.outputTokens;
      groups[key].total += d.totalTokens;
    });

    return Object.entries(groups).map(([name, data]) => ({
      name,
      ...data
    })).sort((a, b) => b.total - a.total);
  }, [filteredData, groupBy]);

  // Per day data for line chart
  const perDayData = useMemo(() => {
    const days: Record<string, number> = {};

    filteredData.forEach(d => {
      const date = new Date(d.timestamp).toLocaleDateString();
      days[date] = (days[date] || 0) + d.totalTokens;
    });

    return Object.entries(days)
      .map(([date, tokens]) => ({ date, tokens }))
      .slice(-30);
  }, [filteredData]);

  // Per day by model/endpoint for detailed view
  const perDayByModelData = useMemo(() => {
    const days: Record<string, Record<string, number>> = {};

    filteredData.forEach(d => {
      const date = new Date(d.timestamp).toLocaleDateString();
      const key = groupBy === 'model' ? d.model : d.endpoint;

      if (!days[date]) {
        days[date] = {};
      }
      if (!days[date][key]) {
        days[date][key] = 0;
      }
      days[date][key] += d.totalTokens;
    });

    const allKeys = new Set<string>();
    Object.values(days).forEach(dayData => {
      Object.keys(dayData).forEach(key => allKeys.add(key));
    });

    return Object.entries(days)
      .map(([date, dayData]) => ({
        date,
        ...dayData
      }))
      .slice(-30);
  }, [filteredData, groupBy]);

  // Calculate stats for a custom counter
  const getCounterStats = useCallback((counter: CustomCounter) => {
    const counterData = usageData.filter(d => d.timestamp >= counter.createdAt);

    // Apply model/endpoint filters to counter data
    let filtered = counterData;
    if (selectedModel !== 'all') {
      filtered = filtered.filter(d => d.model === selectedModel);
    }
    if (selectedEndpoint !== 'all') {
      filtered = filtered.filter(d => d.endpoint === selectedEndpoint);
    }

    return {
      total: filtered.reduce((sum, d) => sum + d.totalTokens, 0),
      input: filtered.reduce((sum, d) => sum + d.inputTokens, 0),
      output: filtered.reduce((sum, d) => sum + d.outputTokens, 0),
      requestCount: filtered.length,
    };
  }, [usageData, selectedModel, selectedEndpoint]);

  // Main totals
  const totals = useMemo(() => ({
    input: filteredData.reduce((sum, d) => sum + d.inputTokens, 0),
    output: filteredData.reduce((sum, d) => sum + d.outputTokens, 0),
    total: filteredData.reduce((sum, d) => sum + d.totalTokens, 0),
  }), [filteredData]);

  // Quick date presets
  const setDatePreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);

    setCustomEndDate(end.toISOString().split('T')[0]);
    setCustomStartDate(start.toISOString().split('T')[0]);
    setTimeFilter('custom');
  };

  // Create custom counter
  const createCounter = () => {
    if (!newCounterName.trim()) return;

    const newCounter: CustomCounter = {
      id: Date.now().toString(),
      name: newCounterName.trim(),
      createdAt: Date.now(),
      color: COLORS[customCounters.length % COLORS.length],
    };

    setCustomCounters([...customCounters, newCounter]);
    setNewCounterName('');
    setShowCreateCounterModal(false);
  };

  // Delete custom counter
  const deleteCounter = (id: string) => {
    if (confirm(t.deleteConfirm)) {
      setCustomCounters(customCounters.filter(c => c.id !== id));
      if (expandedCounterId === id) {
        setExpandedCounterId(null);
      }
    }
  };

  // Reset custom counter (update createdAt to now)
  const resetCounter = (id: string) => {
    if (confirm(t.resetCounterConfirm)) {
      setCustomCounters(customCounters.map(c =>
        c.id === id ? { ...c, createdAt: Date.now() } : c
      ));
    }
  };

  // Rename counter
  const startRename = (counter: CustomCounter) => {
    setEditingCounterId(counter.id);
    setEditingCounterName(counter.name);
  };

  const saveRename = (id: string) => {
    if (editingCounterName.trim()) {
      setCustomCounters(customCounters.map(c =>
        c.id === id ? { ...c, name: editingCounterName.trim() } : c
      ));
    }
    setEditingCounterId(null);
    setEditingCounterName('');
  };

  const cancelRename = () => {
    setEditingCounterId(null);
    setEditingCounterName('');
  };

  // Render chart based on type
  const renderChart = () => {
    if (groupedData.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-on-surface-variant">
          <TrendingUp size={48} className="mb-4 opacity-20" />
          <p>{t.noData}</p>
        </div>
      );
    }

    switch (chartType) {
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={groupedData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.name}: ${entry.total.toLocaleString()}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="total"
              >
                {groupedData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'line':
        const dataKeys = selectedModel === 'all' && selectedEndpoint === 'all'
          ? Array.from(new Set(perDayByModelData.flatMap(d => Object.keys(d).filter(k => k !== 'date'))))
          : [];

        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={selectedModel === 'all' && selectedEndpoint === 'all' ? perDayByModelData : perDayData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline)" />
              <XAxis dataKey="date" stroke="var(--color-on-surface-variant)" />
              <YAxis stroke="var(--color-on-surface-variant)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-outline)',
                  borderRadius: '8px'
                }}
              />
              <Legend />
              {selectedModel === 'all' && selectedEndpoint === 'all' ? (
                dataKeys.map((key, index) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={COLORS[index % COLORS.length]}
                    strokeWidth={2}
                    name={key}
                  />
                ))
              ) : (
                <Line type="monotone" dataKey="tokens" stroke="var(--color-primary)" strokeWidth={2} />
              )}
            </LineChart>
          </ResponsiveContainer>
        );

      default:
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={groupedData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline)" />
              <XAxis dataKey="name" stroke="var(--color-on-surface-variant)" />
              <YAxis stroke="var(--color-on-surface-variant)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-outline)',
                  borderRadius: '8px'
                }}
              />
              <Legend />
              <Bar dataKey="input" name="Input" fill={COLORS[0]} />
              <Bar dataKey="output" name="Output" fill={COLORS[1]} />
            </BarChart>
          </ResponsiveContainer>
        );
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-outline bg-surface-dim sticky top-0 z-10">
        <h2 className="text-lg font-display font-bold text-primary flex items-center gap-2">
          <TrendingUp size={20} />
          {t.title}
        </h2>
      </div>

      {/* Filters */}
      <div className="p-4 flex flex-wrap gap-3 border-b border-outline bg-surface">
        {/* Time filter */}
        <div className="flex items-center gap-1 bg-surface-dim border border-outline rounded-lg overflow-hidden">
          {(['today', 'week', 'month', 'all', 'custom'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setTimeFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium transition-all ${
                timeFilter === f
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:bg-surface'
              }`}
            >
              {f === 'today' ? t.today : f === 'week' ? t.thisWeek : f === 'month' ? t.thisMonth : f === 'all' ? t.allTime : t.customRange}
            </button>
          ))}
        </div>

        {/* Model filter */}
        <div className="relative">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium bg-surface-dim border border-outline rounded-lg text-on-surface hover:bg-surface transition-all appearance-none pr-8 cursor-pointer"
          >
            <option value="all">{t.allModels}</option>
            {uniqueModels.map(model => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant" />
        </div>

        {/* Endpoint filter */}
        <div className="relative">
          <select
            value={selectedEndpoint}
            onChange={(e) => setSelectedEndpoint(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium bg-surface-dim border border-outline rounded-lg text-on-surface hover:bg-surface transition-all appearance-none pr-8 cursor-pointer"
          >
            <option value="all">{t.allEndpoints}</option>
            {uniqueEndpoints.map(endpoint => (
              <option key={endpoint} value={endpoint}>{endpoint}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant" />
        </div>

        {/* Group by */}
        <div className="flex items-center gap-1 bg-surface-dim border border-outline rounded-lg overflow-hidden">
          <button
            onClick={() => setGroupBy('model')}
            className={`px-3 py-1.5 text-xs font-medium transition-all ${
              groupBy === 'model'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:bg-surface'
            }`}
          >
            {t.byModel}
          </button>
          <button
            onClick={() => setGroupBy('endpoint')}
            className={`px-3 py-1.5 text-xs font-medium transition-all ${
              groupBy === 'endpoint'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:bg-surface'
            }`}
          >
            {t.byEndpoint}
          </button>
        </div>

        {/* Chart type */}
        <div className="flex items-center gap-1 bg-surface-dim border border-outline rounded-lg overflow-hidden">
          <button
            onClick={() => setChartType('bar')}
            className={`p-1.5 transition-all ${chartType === 'bar' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:bg-surface'}`}
            title="Bar Chart"
          >
            <BarChart size={16} />
          </button>
          <button
            onClick={() => setChartType('line')}
            className={`p-1.5 transition-all ${chartType === 'line' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:bg-surface'}`}
            title="Line Chart"
          >
            <LineChart size={16} />
          </button>
          <button
            onClick={() => setChartType('pie')}
            className={`p-1.5 transition-all ${chartType === 'pie' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:bg-surface'}`}
            title="Pie Chart"
          >
            <PieChart size={16} />
          </button>
        </div>
      </div>

      {/* Custom Date Range Picker */}
      {timeFilter === 'custom' && (
        <div className="p-4 border-b border-outline bg-surface-dim">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-on-surface-variant">{t.fromDate}:</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                max={customEndDate}
                className="px-3 py-1.5 text-xs bg-surface border border-outline rounded-lg focus:outline-none focus:border-primary"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-on-surface-variant">{t.toDate}:</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                min={customStartDate}
                className="px-3 py-1.5 text-xs bg-surface border border-outline rounded-lg focus:outline-none focus:border-primary"
              />
            </div>
            <button
              onClick={() => setDatePreset(30)}
              className="px-3 py-1.5 text-xs bg-surface border border-outline rounded-lg text-on-surface-variant hover:bg-surface-dim transition-all"
            >
              Reset
            </button>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs text-on-surface-variant">Quick:</span>
            {[
              { label: '7d', days: 7 },
              { label: '14d', days: 14 },
              { label: '30d', days: 30 },
              { label: '90d', days: 90 },
            ].map(preset => (
              <button
                key={preset.label}
                onClick={() => setDatePreset(preset.days)}
                className="px-2 py-1 text-xs bg-surface border border-outline rounded-lg text-on-surface-variant hover:bg-surface-dim transition-all"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="p-4 grid grid-cols-3 gap-4">
        <div className="bg-surface border border-outline rounded-xl p-4">
          <p className="text-[10px] uppercase font-bold text-on-surface-variant mb-1">{t.totalTokens}</p>
          <p className="text-2xl font-display font-bold text-primary">{totals.total.toLocaleString()}</p>
        </div>
        <div className="bg-surface border border-outline rounded-xl p-4">
          <p className="text-[10px] uppercase font-bold text-on-surface-variant mb-1">{t.inputTokens}</p>
          <p className="text-2xl font-display font-bold text-blue-500">{totals.input.toLocaleString()}</p>
        </div>
        <div className="bg-surface border border-outline rounded-xl p-4">
          <p className="text-[10px] uppercase font-bold text-on-surface-variant mb-1">{t.outputTokens}</p>
          <p className="text-2xl font-display font-bold text-pink-500">{totals.output.toLocaleString()}</p>
        </div>
      </div>

      {/* Active Filters */}
      {(selectedModel !== 'all' || selectedEndpoint !== 'all') && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-on-surface-variant">Filters:</span>
            {selectedModel !== 'all' && (
              <span className="px-2 py-1 bg-primary/10 text-primary rounded-lg text-xs font-medium flex items-center gap-1">
                {selectedModel}
                <button onClick={() => setSelectedModel('all')} className="hover:bg-primary/20 rounded p-0.5">
                  <X size={12} />
                </button>
              </span>
            )}
            {selectedEndpoint !== 'all' && (
              <span className="px-2 py-1 bg-secondary/10 text-secondary rounded-lg text-xs font-medium flex items-center gap-1">
                {selectedEndpoint}
                <button onClick={() => setSelectedEndpoint('all')} className="hover:bg-secondary/20 rounded p-0.5">
                  <X size={12} />
                </button>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="px-4">
        <h3 className="text-sm font-bold text-on-surface mb-2">
          {chartType === 'line' ? t.overTime : `${t.byModel} / ${t.byEndpoint}`}
        </h3>
        <div className="bg-surface border border-outline rounded-xl p-4">
          {renderChart()}
        </div>
      </div>

      {/* Custom Counters Section */}
      <div className="p-4 border-t border-outline">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
            <Plus size={16} />
            {t.customCounters}
          </h3>
          <button
            onClick={() => setShowCreateCounterModal(true)}
            className="px-3 py-1.5 bg-primary text-on-primary rounded-lg text-xs font-medium hover:opacity-90 transition-all"
          >
            {t.createCounter}
          </button>
        </div>

        {customCounters.length === 0 ? (
          <p className="text-xs text-on-surface-variant text-center py-4">{t.noData}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {customCounters.map(counter => {
              const stats = getCounterStats(counter);
              const isExpanded = expandedCounterId === counter.id;
              const isEditing = editingCounterId === counter.id;

              return (
                <div
                  key={counter.id}
                  className="bg-surface border border-outline rounded-xl overflow-hidden"
                  style={{ borderLeftWidth: '4px', borderLeftColor: counter.color }}
                >
                  {/* Header */}
                  <div
                    onClick={() => !isEditing && setExpandedCounterId(isExpanded ? null : counter.id)}
                    className="p-3 cursor-pointer hover:bg-surface-dim transition-all"
                  >
                    <div className="flex items-center justify-between mb-2">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editingCounterName}
                          onChange={(e) => setEditingCounterName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && saveRename(counter.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm font-bold bg-surface-dim border border-outline rounded px-2 py-1 flex-1 mr-2 focus:outline-none focus:border-primary"
                          autoFocus
                        />
                      ) : (
                        <span className="text-sm font-bold text-on-surface">{counter.name}</span>
                      )}
                      <div className="flex items-center gap-1">
                        {isEditing ? (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); saveRename(counter.id); }}
                              className="p-1 text-green-500 hover:bg-green-500/10 rounded"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); cancelRename(); }}
                              className="p-1 text-error hover:bg-error/10 rounded"
                            >
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); startRename(counter); }}
                              className="p-1 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded"
                              title={t.rename}
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); resetCounter(counter.id); }}
                              className="p-1 text-on-surface-variant hover:text-blue-500 hover:bg-blue-500/10 rounded"
                              title={t.resetCounter}
                            >
                              <RotateCw size={14} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteCounter(counter.id); }}
                              className="p-1 text-on-surface-variant hover:text-error hover:bg-error/10 rounded"
                              title={t.deleteCounter}
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-xl font-bold text-primary" style={{ color: counter.color }}>
                        {stats.total.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-on-surface-variant">tokens</span>
                    </div>

                    {/* Sub info */}
                    <div className="flex items-center justify-between text-[10px] text-on-surface-variant">
                      <span>{stats.requestCount} requests</span>
                      <span>{t.activeSince}: {new Date(counter.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="p-3 border-t border-outline bg-surface-dim">
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="bg-surface rounded-lg p-2">
                          <p className="text-[10px] text-on-surface-variant">Input</p>
                          <p className="text-sm font-bold text-blue-500">{stats.input.toLocaleString()}</p>
                        </div>
                        <div className="bg-surface rounded-lg p-2">
                          <p className="text-[10px] text-on-surface-variant">Output</p>
                          <p className="text-sm font-bold text-pink-500">{stats.output.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reset All Data */}
      <div className="p-4 border-t border-outline">
        <button
          onClick={() => setConfirmReset(!confirmReset)}
          className="w-full px-4 py-3 bg-error/10 text-error rounded-xl text-sm font-medium hover:bg-error/20 transition-all flex items-center justify-center gap-2"
        >
          {confirmReset ? (
            <>
              <span>{t.resetConfirm}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onResetUsage) onResetUsage();
                  setConfirmReset(false);
                }}
                className="px-3 py-1 bg-error text-white rounded-lg text-xs"
              >
                Confirm
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmReset(false);
                }}
                className="px-3 py-1 bg-surface border border-outline rounded-lg text-xs"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <RotateCw size={16} />
              {t.reset} All Data
            </>
          )}
        </button>
      </div>

      {/* Create Counter Modal */}
      {showCreateCounterModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-outline rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-on-surface">{t.createCounter}</h3>
              <button
                onClick={() => setShowCreateCounterModal(false)}
                className="p-1 hover:bg-surface-dim rounded-lg transition-all"
              >
                <X size={20} />
              </button>
            </div>
            <input
              type="text"
              value={newCounterName}
              onChange={(e) => setNewCounterName(e.target.value)}
              placeholder={t.counterName}
              className="w-full px-4 py-3 bg-surface-dim border border-outline rounded-xl mb-4 focus:outline-none focus:border-primary"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && createCounter()}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowCreateCounterModal(false)}
                className="flex-1 px-4 py-3 bg-surface-dim border border-outline rounded-xl text-sm font-medium hover:bg-surface transition-all"
              >
                Cancel
              </button>
              <button
                onClick={createCounter}
                disabled={!newCounterName.trim()}
                className="flex-1 px-4 py-3 bg-primary text-on-primary rounded-xl text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

