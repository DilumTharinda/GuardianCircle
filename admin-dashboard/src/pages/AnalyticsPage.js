import React, { useMemo } from 'react';
import { BarChart3, Map, AlertTriangle, PackageSearch, CheckCircle } from 'lucide-react';
import HeatmapMap from '../components/HeatmapMap';
import { toDate } from '../services/adminService';

export default function AnalyticsPage({ reports = [], allAlerts = [] }) {
  const stats = useMemo(() => {
    const unsafe = reports.filter((r) => r.type === 'unsafe_location');
    const lost = reports.filter((r) => r.type === 'lost');
    const found = reports.filter((r) => r.type === 'found' || r.type === 'sighting');
    const returned = reports.filter((r) => r.status === 'returned');
    const flagged = reports.filter((r) => r.isFlagged);

    // Build last 7 days volume chart data
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push({
        key: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
        lostFound: 0,
        unsafe: 0,
      });
    }

    const dayMap = new Map(days.map((d) => [d.key, d]));
    reports.forEach((r) => {
      const created = toDate(r.createdAt);
      if (!created) return;
      const key = created.toISOString().slice(0, 10);
      const bucket = dayMap.get(key);
      if (!bucket) return;
      if (r.type === 'unsafe_location') bucket.unsafe += 1;
      else bucket.lostFound += 1;
    });

    const maxDaily = Math.max(
      1,
      ...days.map((d) => d.lostFound + d.unsafe)
    );

    // Category breakdown
    const categoryCounts = {};
    reports.forEach((r) => {
      const cat = r.category || 'Other';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
    const topCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    return {
      totalReports: reports.length,
      unsafeCount: unsafe.length,
      lostCount: lost.length,
      foundCount: found.length,
      returnedCount: returned.length,
      flaggedCount: flagged.length,
      totalAlerts: allAlerts.length,
      unsafeReports: unsafe,
      days,
      maxDaily,
      topCategories,
    };
  }, [reports, allAlerts]);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Heatmap &amp; Report Analytics</h1>
          <p className="page-subtitle">
            Unsafe-location density clusters and Lost &amp; Found report trends over time
          </p>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon">
            <BarChart3 size={22} />
          </div>
          <div>
            <div className="kpi-value">{stats.totalReports}</div>
            <div className="kpi-label">Total Reports</div>
          </div>
        </div>
        <div className="kpi-card danger">
          <div className="kpi-icon">
            <AlertTriangle size={22} />
          </div>
          <div>
            <div className="kpi-value">{stats.unsafeCount}</div>
            <div className="kpi-label">Unsafe Locations</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon">
            <PackageSearch size={22} />
          </div>
          <div>
            <div className="kpi-value">
              {stats.lostCount} / {stats.foundCount}
            </div>
            <div className="kpi-label">Lost / Found &amp; Sightings</div>
          </div>
        </div>
        <div className="kpi-card success">
          <div className="kpi-icon">
            <CheckCircle size={22} />
          </div>
          <div>
            <div className="kpi-value">{stats.returnedCount}</div>
            <div className="kpi-label">Reunited / Returned</div>
          </div>
        </div>
      </div>

      <div className="split-grid">
        <section className="panel map-panel">
          <div className="panel-header">
            <h2>
              <Map size={18} /> Unsafe-Location Density Heatmap
            </h2>
            <div className="heatmap-legend">
              <span className="legend-dot low" /> 1
              <span className="legend-dot med" /> 2-3
              <span className="legend-dot high" /> 4+
            </div>
          </div>
          <HeatmapMap reports={stats.unsafeReports} />
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>7-Day Report Volume</h2>
          </div>

          <div className="chart-container">
            {stats.days.map((day) => {
              const total = day.lostFound + day.unsafe;
              const lfPct = (day.lostFound / stats.maxDaily) * 100;
              const unPct = (day.unsafe / stats.maxDaily) * 100;
              return (
                <div key={day.key} className="chart-row">
                  <div className="chart-label">{day.label}</div>
                  <div className="chart-bar-track">
                    {day.lostFound > 0 && (
                      <div
                        className="chart-bar primary"
                        style={{ width: `${lfPct}%` }}
                        title={`Lost & Found: ${day.lostFound}`}
                      />
                    )}
                    {day.unsafe > 0 && (
                      <div
                        className="chart-bar danger"
                        style={{ width: `${unPct}%` }}
                        title={`Unsafe Locations: ${day.unsafe}`}
                      />
                    )}
                  </div>
                  <div className="chart-count">{total}</div>
                </div>
              );
            })}
          </div>

          <div className="chart-legend">
            <span>
              <span className="legend-swatch primary" /> Lost &amp; Found
            </span>
            <span>
              <span className="legend-swatch danger" /> Unsafe Location
            </span>
          </div>

          <div className="panel-divider" />

          <h3 className="subpanel-title">Top Report Categories</h3>
          {stats.topCategories.length === 0 ? (
            <p className="muted">No report data available yet.</p>
          ) : (
            <div className="category-list">
              {stats.topCategories.map(([cat, count]) => (
                <div key={cat} className="category-item">
                  <span>{cat}</span>
                  <span className="category-count">{count}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
