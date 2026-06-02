'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { MapPin, ChevronRight, ChevronDown, Check, X, Search, Globe, MapPinned } from 'lucide-react';
import { useCascaderAreaData, areaList } from '@vant/area-data';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

type Level = 'planet' | 'country' | 'province' | 'city' | 'district';

interface CascaderOption {
  text: string;
  value: string;
  children?: CascaderOption[];
}

interface CountryOption {
  text: string;
  value: string;
}

interface PlanetOption {
  text: string;
  value: string;
}

const PLANET_LIST: PlanetOption[] = [
  { text: '地球', value: 'earth' },
  { text: '火星', value: 'mars' },
  { text: '月球', value: 'moon' },
  { text: '金星', value: 'venus' },
  { text: '木星', value: 'jupiter' },
  { text: '水星', value: 'mercury' },
  { text: '土星', value: 'saturn' },
  { text: '天王星', value: 'uranus' },
  { text: '海王星', value: 'neptune' },
  { text: '冥王星', value: 'pluto' },
];

const COUNTRY_LIST: CountryOption[] = [
  { text: '中国', value: 'CN' },
  { text: '美国', value: 'US' },
  { text: '日本', value: 'JP' },
  { text: '韩国', value: 'KR' },
  { text: '英国', value: 'GB' },
  { text: '法国', value: 'FR' },
  { text: '德国', value: 'DE' },
  { text: '加拿大', value: 'CA' },
  { text: '澳大利亚', value: 'AU' },
  { text: '新加坡', value: 'SG' },
  { text: '马来西亚', value: 'MY' },
  { text: '泰国', value: 'TH' },
  { text: '越南', value: 'VN' },
  { text: '印度', value: 'IN' },
  { text: '俄罗斯', value: 'RU' },
  { text: '巴西', value: 'BR' },
  { text: '意大利', value: 'IT' },
  { text: '西班牙', value: 'ES' },
  { text: '新西兰', value: 'NZ' },
  { text: '荷兰', value: 'NL' },
  { text: '瑞典', value: 'SE' },
  { text: '瑞士', value: 'CH' },
  { text: '阿联酋', value: 'AE' },
  { text: '菲律宾', value: 'PH' },
  { text: '印度尼西亚', value: 'ID' },
  { text: '墨西哥', value: 'MX' },
  { text: '阿根廷', value: 'AR' },
  { text: '埃及', value: 'EG' },
  { text: '南非', value: 'ZA' },
  { text: '以色列', value: 'IL' },
  { text: '土耳其', value: 'TR' },
  { text: '波兰', value: 'PL' },
  { text: '比利时', value: 'BE' },
  { text: '奥地利', value: 'AT' },
  { text: '丹麦', value: 'DK' },
  { text: '挪威', value: 'NO' },
  { text: '芬兰', value: 'FI' },
  { text: '爱尔兰', value: 'IE' },
  { text: '葡萄牙', value: 'PT' },
  { text: '希腊', value: 'GR' },
  { text: '捷克', value: 'CZ' },
  { text: '匈牙利', value: 'HU' },
  { text: '乌克兰', value: 'UA' },
  { text: '罗马尼亚', value: 'RO' },
  { text: '哥伦比亚', value: 'CO' },
  { text: '智利', value: 'CL' },
  { text: '秘鲁', value: 'PE' },
  { text: '尼日利亚', value: 'NG' },
  { text: '肯尼亚', value: 'KE' },
  { text: '巴基斯坦', value: 'PK' },
  { text: '孟加拉国', value: 'BD' },
  { text: '缅甸', value: 'MM' },
  { text: '柬埔寨', value: 'KH' },
  { text: '老挝', value: 'LA' },
  { text: '蒙古', value: 'MN' },
  { text: '尼泊尔', value: 'NP' },
  { text: '斯里兰卡', value: 'LK' },
  { text: '冰岛', value: 'IS' },
];

interface LocationCascaderProps {
  value: {
    planet?: string;
    country?: string;
    province?: string;
    city?: string;
    district?: string;
  };
  onChange: (value: {
    planet?: string;
    country?: string;
    province?: string;
    city?: string;
    district?: string;
  }) => void;
  disabled?: boolean;
}

function findOptionByValue(options: CascaderOption[], val: string): CascaderOption | undefined {
  return options.find(o => o.value === val);
}

function findOptionByText(options: CascaderOption[], text: string): CascaderOption | undefined {
  return options.find(o => o.text === text);
}

function codeToText(code: string): string {
  if (!code) return '';
  return (areaList.province_list[code] || areaList.city_list[code] || areaList.county_list[code] || '');
}

export function planetValueToText(val: string): string {
  const p = PLANET_LIST.find(o => o.value === val);
  return p?.text ?? val;
}

export function planetTextToValue(text: string): string {
  const p = PLANET_LIST.find(o => o.text === text);
  return p?.value ?? '';
}

export function countryValueToText(val: string): string {
  const c = COUNTRY_LIST.find(o => o.value === val);
  return c?.text ?? val;
}

export function countryTextToValue(text: string): string {
  const c = COUNTRY_LIST.find(o => o.text === text);
  return c?.value ?? '';
}

export function LocationCascader({ value, onChange, disabled }: LocationCascaderProps) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<Level>('planet');
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const cascaderData = useCascaderAreaData();

  const isEarth = value.planet === 'earth';
  const isChina = isEarth && value.country === 'CN';

  const provinceOptions = cascaderData;

  const internalProvinceCode = useMemo(() => {
    if (!isChina || !value.province) return '';
    if (/^\d{6}$/.test(value.province)) return value.province;
    return findOptionByText(provinceOptions, value.province)?.value ?? '';
  }, [value.province, provinceOptions, isChina]);

  const cityOptions = useMemo(() => {
    if (!internalProvinceCode) return [];
    const prov = findOptionByValue(provinceOptions, internalProvinceCode);
    return prov?.children ?? [];
  }, [internalProvinceCode, provinceOptions]);

  const internalCityCode = useMemo(() => {
    if (!value.city) return '';
    if (/^\d{6}$/.test(value.city)) return value.city;
    const opt = findOptionByText(cityOptions, value.city);
    return opt?.value ?? '';
  }, [value.city, cityOptions]);

  const districtOptions = useMemo(() => {
    if (!internalCityCode) return [];
    const city = findOptionByValue(cityOptions, internalCityCode);
    return city?.children ?? [];
  }, [internalCityCode, cityOptions]);

  const internalDistrictCode = useMemo(() => {
    if (!value.district) return '';
    if (/^\d{6}$/.test(value.district)) return value.district;
    const opt = findOptionByText(districtOptions, value.district);
    return opt?.value ?? '';
  }, [value.district, districtOptions]);

  const currentOptions = useMemo(() => {
    switch (level) {
      case 'planet': return PLANET_LIST;
      case 'country': return COUNTRY_LIST;
      case 'province': return provinceOptions;
      case 'city': return cityOptions;
      case 'district': return districtOptions;
    }
  }, [level, provinceOptions, cityOptions, districtOptions]);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return currentOptions;
    return currentOptions.filter(o => o.text.includes(search.trim()));
  }, [currentOptions, search]);

  const displayText = useMemo(() => {
    const parts: string[] = [];
    if (value.planet) parts.push(planetValueToText(value.planet));
    if (isEarth && value.country) parts.push(countryValueToText(value.country));
    if (isChina) {
      if (internalProvinceCode) parts.push(codeToText(internalProvinceCode));
      if (internalCityCode) parts.push(codeToText(internalCityCode));
      if (internalDistrictCode) parts.push(codeToText(internalDistrictCode));
    }
    return parts.join(' / ');
  }, [value.planet, value.country, isEarth, isChina, internalProvinceCode, internalCityCode, internalDistrictCode]);

  const hasLocation = !!(value.planet);

  const handleSelect = useCallback((optionValue: string) => {
    switch (level) {
      case 'planet': {
        if (optionValue === 'earth') {
          onChange({ planet: optionValue, country: '', province: '', city: '', district: '' });
          setLevel('country');
        } else {
          onChange({ planet: optionValue, country: '', province: '', city: '', district: '' });
          setOpen(false);
        }
        setSearch('');
        break;
      }
      case 'country': {
        if (optionValue === 'CN') {
          onChange({ ...value, country: optionValue, province: '', city: '', district: '' });
          setLevel('province');
        } else {
          onChange({ ...value, country: optionValue, province: '', city: '', district: '' });
          setOpen(false);
        }
        setSearch('');
        break;
      }
      case 'province': {
        const text = codeToText(optionValue);
        onChange({ ...value, province: text, city: '', district: '' });
        setLevel('city');
        setSearch('');
        break;
      }
      case 'city': {
        const text = codeToText(optionValue);
        onChange({ ...value, city: text, district: '' });
        setLevel('district');
        setSearch('');
        break;
      }
      case 'district': {
        const text = codeToText(optionValue);
        onChange({ ...value, district: text });
        setOpen(false);
        setSearch('');
        setLevel('planet');
        break;
      }
    }
  }, [level, value, onChange]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setLevel('planet');
      setSearch('');
    }
  }, []);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange({ planet: '', country: '', province: '', city: '', district: '' });
    setLevel('planet');
    setSearch('');
  }, [onChange]);

  const handleLevelClick = useCallback((targetLevel: Level) => {
    setLevel(targetLevel);
    setSearch('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const levelLabels: Record<Level, string> = {
    planet: '星球',
    country: '国家',
    province: '省份',
    city: '城市',
    district: '区县',
  };

  const breadcrumbs = useMemo(() => {
    const items: { level: Level; label: string; active: boolean }[] = [
      { level: 'planet', label: value.planet ? planetValueToText(value.planet) : '选择星球', active: level === 'planet' },
    ];
    if (isEarth) {
      if (value.planet) {
        items.push({ level: 'country', label: value.country ? countryValueToText(value.country) : '选择国家', active: level === 'country' });
      }
      if (isChina) {
        if (value.country) {
          items.push({ level: 'province', label: internalProvinceCode ? codeToText(internalProvinceCode) : '选择省份', active: level === 'province' });
        }
        if (internalProvinceCode) {
          items.push({ level: 'city', label: internalCityCode ? codeToText(internalCityCode) : '选择城市', active: level === 'city' });
        }
        if (internalCityCode) {
          items.push({ level: 'district', label: internalDistrictCode ? codeToText(internalDistrictCode) : '选择区县', active: level === 'district' });
        }
      }
    }
    return items;
  }, [value.planet, value.country, isEarth, isChina, internalProvinceCode, internalCityCode, internalDistrictCode, level]);

  useEffect(() => {
    if (open) {
      if (!value.planet) {
        setLevel('planet');
      } else if (!isEarth) {
        setLevel('planet');
      } else if (!value.country) {
        setLevel('country');
      } else if (isChina) {
        if (internalProvinceCode && internalCityCode) {
          setLevel('district');
        } else if (internalProvinceCode) {
          setLevel('city');
        } else {
          setLevel('province');
        }
      } else {
        setLevel('country');
      }
    }
  }, [open, value.planet, value.country, isEarth, isChina, internalProvinceCode, internalCityCode]);

  const renderOptionList = () => {
    if (level === 'planet') {
      return (filteredOptions as PlanetOption[]).map((option) => {
        const isSelected = value.planet === option.value;
        return (
          <CommandItem
            key={option.value}
            value={option.text}
            onSelect={() => handleSelect(option.value)}
            className={cn(
              "flex items-center justify-between px-3 py-2 cursor-pointer rounded-md transition-colors",
              isSelected && "text-[var(--brand-start)]"
            )}
          >
            <span className="text-sm">{option.text}</span>
            {isSelected && <Check className="w-4 h-4 text-[var(--brand-start)]" />}
          </CommandItem>
        );
      });
    }

    if (level === 'country') {
      return (filteredOptions as CountryOption[]).map((option) => {
        const isSelected = value.country === option.value;
        return (
          <CommandItem
            key={option.value}
            value={option.text}
            onSelect={() => handleSelect(option.value)}
            className={cn(
              "flex items-center justify-between px-3 py-2 cursor-pointer rounded-md transition-colors",
              isSelected && "text-[var(--brand-start)]"
            )}
          >
            <span className="text-sm">{option.text}</span>
            {isSelected && <Check className="w-4 h-4 text-[var(--brand-start)]" />}
          </CommandItem>
        );
      });
    }

    return (filteredOptions as CascaderOption[]).map((option) => {
      const isSelected =
        (level === 'province' && internalProvinceCode === option.value) ||
        (level === 'city' && internalCityCode === option.value) ||
        (level === 'district' && internalDistrictCode === option.value);
      return (
        <CommandItem
          key={option.value}
          value={option.text}
          onSelect={() => handleSelect(option.value)}
          className={cn(
            "flex items-center justify-between px-3 py-2 cursor-pointer rounded-md transition-colors",
            isSelected && "text-[var(--brand-start)]"
          )}
        >
          <span className="text-sm">{option.text}</span>
          {isSelected && <Check className="w-4 h-4 text-[var(--brand-start)]" />}
        </CommandItem>
      );
    });
  };

  return (
    <div className="relative">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "w-full px-4 py-3 text-left rounded-lg border flex items-center justify-between gap-2 transition-all duration-200",
              "bg-[var(--background)] border-[var(--border)]",
              disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-[var(--brand-start)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand-start)]/30',
              open && 'border-[var(--brand-start)] ring-2 ring-[var(--brand-start)]/30'
            )}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: hasLocation ? 'var(--brand-start)' : 'var(--muted-foreground)' }} />
              <span className={cn("truncate text-sm", hasLocation ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]')}>
                {displayText || '请选择所在地'}
              </span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <ChevronDown className={cn("w-4 h-4 text-[var(--muted-foreground)] transition-transform duration-200", open && 'rotate-180')} />
            </div>
          </button>
        </PopoverTrigger>

        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0 overflow-hidden"
          align="start"
          sideOffset={8}
        >
          <div className="flex flex-col">
            <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--border)] bg-[var(--muted)]/30 overflow-x-auto">
              {breadcrumbs.map((crumb, idx) => (
                <div key={crumb.level} className="flex items-center gap-1 shrink-0">
                  {idx > 0 && <ChevronRight className="w-3 h-3 text-[var(--muted-foreground)]" />}
                  <button
                    type="button"
                    onClick={() => handleLevelClick(crumb.level)}
                    className={cn(
                      "text-xs px-1.5 py-0.5 rounded transition-colors whitespace-nowrap",
                      crumb.active
                        ? "text-[var(--brand-start)] font-medium"
                        : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    )}
                  >
                    {crumb.label}
                  </button>
                </div>
              ))}
            </div>

            <div className="px-3 py-2.5 border-b border-[var(--border)]">
              {hasLocation ? (
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[var(--muted)]/50 border border-[var(--border)]/60">
                  <div className="flex items-center justify-center w-7 h-7 rounded-md bg-gradient-to-br from-[var(--brand-start)]/20 to-[var(--brand-end)]/20 shrink-0">
                    <MapPinned className="w-3.5 h-3.5 text-[var(--brand-start)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--muted-foreground)] leading-none mb-0.5">当前所在地</p>
                    <p className="text-sm font-medium text-[var(--foreground)] truncate leading-snug">{displayText}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="shrink-0 p-1 rounded-md hover:bg-[var(--background)] transition-colors"
                    title="清除"
                  >
                    <X className="w-3 h-3 text-[var(--muted-foreground)]" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[var(--muted)]/30 border border-dashed border-[var(--border)]">
                  <div className="flex items-center justify-center w-7 h-7 rounded-md bg-[var(--muted)] shrink-0">
                    <Globe className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--muted-foreground)] leading-none mb-0.5">尚未设置所在地</p>
                    <p className="text-sm text-[var(--muted-foreground)] leading-snug">地球</p>
                  </div>
                </div>
              )}
            </div>

            <div className="px-3 py-2 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-[var(--muted-foreground)] flex-shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`搜索${levelLabels[level]}...`}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--muted-foreground)]"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="p-0.5 rounded-sm hover:bg-[var(--muted)] transition-colors"
                  >
                    <X className="w-3 h-3 text-[var(--muted-foreground)]" />
                  </button>
                )}
              </div>
            </div>

            <Command className="border-0">
              <CommandList className="max-h-[240px]">
                <CommandEmpty className="py-4 text-center text-sm text-[var(--muted-foreground)]">
                  未找到匹配的{levelLabels[level]}
                </CommandEmpty>
                <CommandGroup>
                  {renderOptionList()}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
