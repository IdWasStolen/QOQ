import React, { useEffect, useMemo, useState } from 'react';
import { dashboard, bitable, DashboardState, IConfig } from '@lark-base-open/js-sdk';
import { Table, Typography, Select, Button, Spin, Toast } from '@douyinfe/semi-ui';
import { useConfig, useTheme } from '../../hooks';
import './style.scss';

const { Text } = Typography;

interface IPluginConfig {
  tableId?: string;
  monthFieldId?: string;
  dimensionFieldId?: string;
  measureFieldId?: string;
}

interface IRecordLite {
  month: string;
  dimension: string;
  value: number;
}

interface IRowView {
  dimension: string;
  currentValue: number;
  prevValue: number;
  ratioText: string;
  ratioNumber: number | null;
}

/** 检查是否在飞书环境中 */
function isLarkEnv(): boolean {
  return typeof window !== 'undefined' && !!(window as any).bitable && !!(window as any).dashboard;
}

async function fetchConfigTables() {
  if (!isLarkEnv()) {
    return [];
  }
  try {
    const metaList = await bitable.base.getTableMetaList();
    return metaList ?? [];
  } catch (e) {
    console.error(e);
    Toast.error('获取表列表失败');
    return [];
  }
}

async function fetchFieldsByTableId(tableId: string) {
  if (!isLarkEnv()) {
    return [];
  }
  try {
    const table = await bitable.base.getTableById(tableId);
    const fields = await table.getFieldMetaList();
    return fields ?? [];
  } catch (e) {
    console.error(e);
    Toast.error('获取字段列表失败');
    return [];
  }
}

async function fetchRecordsByConfig(config: IPluginConfig): Promise<IRecordLite[]> {
  if (!isLarkEnv() || !config.tableId || !config.monthFieldId || !config.dimensionFieldId || !config.measureFieldId) {
    return [];
  }
  const table = await bitable.base.getTableById(config.tableId);
  // getRecordList 的具体参数与返回值参考官方文档，为避免类型限制，这里用 any 处理
  const allRecords: IRecordLite[] = [];

  let pageToken: string | undefined;
  // 简单分页拉取，直到没有下一页
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const resp: any = await (table as any).getRecordList({
      pageToken,
      pageSize: 500,
    });
    const records: any[] = resp?.records ?? [];
    records.forEach((r: any) => {
      const fields = r.fields ?? {};
      const month = fields[config.monthFieldId!] as string;
      const dimension = fields[config.dimensionFieldId!] as string;
      const rawValue = fields[config.measureFieldId!];
      const value = typeof rawValue === 'number' ? rawValue : Number(rawValue ?? 0);
      if (month && dimension) {
        allRecords.push({
          month,
          dimension,
          value: Number.isFinite(value) ? value : 0,
        });
      }
    });
    if (!resp?.hasMore || !resp?.pageToken) {
      break;
    }
    pageToken = resp.pageToken as string;
  }
  return allRecords;
}

function calcRatio(current: number, previous: number): { text: string; number: number | null } {
  if (!previous) {
    return { text: '--', number: null };
  }
  const ratio = (current - previous) / previous;
  const percent = (ratio * 100).toFixed(1);
  const sign = ratio > 0 ? '+' : '';
  return { text: `${sign}${percent}%`, number: ratio };
}

function getPrevMonth(current: string): string | null {
  // 假设格式为 YYYY-MM，例如 2025-07
  const m = /^(\d{4})-(\d{2})$/.exec(current);
  if (!m) return null;
  let year = Number(m[1]);
  let month = Number(m[2]);
  month -= 1;
  if (month === 0) {
    month = 12;
    year -= 1;
  }
  return `${year}-${month.toString().padStart(2, '0')}`;
}

export default function PeriodAnalysis() {
  const isLark = isLarkEnv();
  let isCreate = false;
  let isConfigMode = false;
  
  if (isLark) {
    try {
      isCreate = dashboard.state === DashboardState.Create;
      isConfigMode = dashboard.state === DashboardState.Config || isCreate;
    } catch (e) {
      // 忽略错误
    }
  }

  const [config, setConfig] = useState<IPluginConfig>({});
  const [tables, setTables] = useState<any[]>([]);
  const [fields, setFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<IRecordLite[]>([]);
  const [currentMonth, setCurrentMonth] = useState<string | undefined>();

  const { bgColor } = useTheme();

  // 汇总当前周期与上一周期的总值，用于顶部指标卡展示
  const summary = useMemo(() => {
    if (!currentMonth) {
      return null;
    }
    const prev = getPrevMonth(currentMonth);
    let currentTotal = 0;
    let prevTotal = 0;

    records.forEach(r => {
      if (r.month === currentMonth) {
        currentTotal += r.value;
      }
      if (prev && r.month === prev) {
        prevTotal += r.value;
      }
    });

    const ratio = calcRatio(currentTotal, prevTotal);
    return {
      currentTotal,
      prevTotal,
      ratioText: ratio.text,
      ratioNumber: ratio.number,
    };
  }, [records, currentMonth]);

  const months = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => set.add(r.month));
    return Array.from(set).sort();
  }, [records]);

  const rows: IRowView[] = useMemo(() => {
    if (!currentMonth) return [];
    const prev = getPrevMonth(currentMonth);
    const currentMap = new Map<string, number>();
    const prevMap = new Map<string, number>();

    records.forEach(r => {
      if (r.month === currentMonth) {
        currentMap.set(r.dimension, (currentMap.get(r.dimension) ?? 0) + r.value);
      }
      if (prev && r.month === prev) {
        prevMap.set(r.dimension, (prevMap.get(r.dimension) ?? 0) + r.value);
      }
    });

    const allDimensions = new Set<string>([
      ...Array.from(currentMap.keys()),
      ...Array.from(prevMap.keys()),
    ]);

    const result: IRowView[] = [];
    allDimensions.forEach(dimension => {
      const currentValue = currentMap.get(dimension) ?? 0;
      const prevValue = prevMap.get(dimension) ?? 0;
      const ratio = calcRatio(currentValue, prevValue);
      result.push({
        dimension,
        currentValue,
        prevValue,
        ratioText: ratio.text,
        ratioNumber: ratio.number,
      });
    });
    // 默认按当前值从大到小排序
    result.sort((a, b) => b.currentValue - a.currentValue);
    return result;
  }, [records, currentMonth]);

  const updateConfigFromDashboard = (c: IConfig) => {
    const data = (c.customConfig ?? {}) as IPluginConfig;
    setConfig(data);
  };

  useConfig(updateConfigFromDashboard);

  useEffect(() => {
    fetchConfigTables().then(setTables);
  }, []);

  useEffect(() => {
    if (!config.tableId) return;
    fetchFieldsByTableId(config.tableId).then(setFields);
  }, [config.tableId]);

  useEffect(() => {
    if (!config.tableId || !config.monthFieldId || !config.dimensionFieldId || !config.measureFieldId) return;
    setLoading(true);
    fetchRecordsByConfig(config)
      .then(data => {
        setRecords(data);
        if (!currentMonth && data.length) {
          setCurrentMonth(data[0].month);
        }
      })
      .catch((e) => {
        console.error(e);
        Toast.error('拉取数据失败');
      })
      .finally(() => setLoading(false));
  }, [config.tableId, config.monthFieldId, config.dimensionFieldId, config.measureFieldId]);

  const saveCurrentConfig = async () => {
    if (!isLarkEnv()) {
      Toast.error('非飞书环境，无法保存配置');
      return;
    }
    try {
      await dashboard.saveConfig({
        customConfig: config,
        dataConditions: [],
      } as any);
      Toast.success('配置已保存');
    } catch (e) {
      console.error(e);
      Toast.error('保存配置失败');
    }
  };

  const tableOptions = tables.map(t => ({ label: t.name, value: t.id }));
  const monthFieldOptions = fields.map(f => ({ label: f.name, value: f.id }));
  const dimensionFieldOptions = fields.map(f => ({ label: f.name, value: f.id }));
  const measureFieldOptions = fields.map(f => ({ label: f.name, value: f.id }));

  // 非飞书环境显示提示
  if (!isLark) {
    return (
      <main className="period-analysis-main" style={{ backgroundColor: bgColor, padding: '40px', textAlign: 'center' }}>
        <Text strong style={{ fontSize: '18px', color: '#666' }}>
          此插件需要在飞书多维表格环境中运行
        </Text>
        <div style={{ marginTop: '20px', color: '#999' }}>
          <Text>请在飞书多维表格的仪表盘中添加此插件组件</Text>
        </div>
      </main>
    );
  }

  return (
    <main className="period-analysis-main" style={{ backgroundColor: bgColor }}>
      <div className="period-analysis-header">
        <Text strong>周期环比分析</Text>
        {months.length > 0 && (
          <div className="period-analysis-header-controls">
            <Text>周期：</Text>
            <Select
              style={{ width: 160 }}
              value={currentMonth}
              onChange={(v) => setCurrentMonth(v as string)}
              placeholder="请选择周期"
            >
              {months.map(m => (
                <Select.Option key={m} value={m}>
                  {m}
                </Select.Option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {isConfigMode && (
        <div className="period-analysis-config">
          <div className="config-row">
            <Text>数据表：</Text>
            <Select
              style={{ width: 240 }}
              value={config.tableId}
              placeholder="请选择表"
              onChange={(v) => setConfig(prev => ({ ...prev, tableId: v as string, monthFieldId: undefined, dimensionFieldId: undefined, measureFieldId: undefined }))}
            >
              {tableOptions.map(o => (
                <Select.Option key={o.value} value={o.value}>
                  {o.label}
                </Select.Option>
              ))}
            </Select>
          </div>

          <div className="config-row">
            <Text>时间周期字段（如月份）：</Text>
            <Select
              style={{ width: 240 }}
              value={config.monthFieldId}
              placeholder="请选择字段"
              onChange={(v) => setConfig(prev => ({ ...prev, monthFieldId: v as string }))}
            >
              {monthFieldOptions.map(o => (
                <Select.Option key={o.value} value={o.value}>
                  {o.label}
                </Select.Option>
              ))}
            </Select>
          </div>

          <div className="config-row">
            <Text>分析维度字段（如通用名）：</Text>
            <Select
              style={{ width: 240 }}
              value={config.dimensionFieldId}
              placeholder="请选择字段"
              onChange={(v) => setConfig(prev => ({ ...prev, dimensionFieldId: v as string }))}
            >
              {dimensionFieldOptions.map(o => (
                <Select.Option key={o.value} value={o.value}>
                  {o.label}
                </Select.Option>
              ))}
            </Select>
          </div>

          <div className="config-row">
            <Text>指标字段（如销售额GMV）：</Text>
            <Select
              style={{ width: 240 }}
              value={config.measureFieldId}
              placeholder="请选择字段"
              onChange={(v) => setConfig(prev => ({ ...prev, measureFieldId: v as string }))}
            >
              {measureFieldOptions.map(o => (
                <Select.Option key={o.value} value={o.value}>
                  {o.label}
                </Select.Option>
              ))}
            </Select>
          </div>

          <div className="config-actions">
            <Button theme="solid" type="primary" onClick={saveCurrentConfig}>
              保存配置
            </Button>
          </div>
        </div>
      )}

      <div className="period-analysis-content">
        {summary && (
          <div className="period-analysis-summary">
            <div className="summary-card">
              <div className="summary-title">指标卡</div>
              <div className="summary-value">
                {summary.currentTotal.toLocaleString?.() ?? summary.currentTotal}
              </div>
              <div className="summary-sub">
                <span className="summary-label">当前周期：</span>
                <span>{currentMonth}</span>
              </div>
              <div className="summary-sub">
                <span className="summary-label">上一周期：</span>
                <span>
                  {getPrevMonth(currentMonth!) ?? '--'}
                </span>
              </div>
              <div
                className={
                  summary.ratioNumber == null
                    ? 'summary-ratio summary-ratio-neutral'
                    : summary.ratioNumber > 0
                    ? 'summary-ratio summary-ratio-up'
                    : summary.ratioNumber < 0
                    ? 'summary-ratio summary-ratio-down'
                    : 'summary-ratio summary-ratio-neutral'
                }
              >
                环比 {summary.ratioText}
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="period-analysis-loading">
            <Spin />
          </div>
        ) : (
          <Table
            size="small"
            dataSource={rows}
            pagination={false}
            columns={[
              { title: '通用名', dataIndex: 'dimension' },
              {
                title: '当前周期值',
                dataIndex: 'currentValue',
                render: (v: number) => v?.toLocaleString?.() ?? v,
              },
              {
                title: '上一周期值',
                dataIndex: 'prevValue',
                render: (v: number) => v?.toLocaleString?.() ?? v,
              },
              {
                title: '环比',
                dataIndex: 'ratioText',
                render: (text: string, record: IRowView) => {
                  if (record.ratioNumber == null) {
                    return <Text type="tertiary">{text}</Text>;
                  }
                  return (
                    <Text type={record.ratioNumber > 0 ? 'danger' : record.ratioNumber < 0 ? 'success' : 'secondary'}>
                      {text}
                    </Text>
                  );
                },
              },
            ]}
          />
        )}
      </div>
    </main>
  );
}


