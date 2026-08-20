'use client';

import React, { useState, useRef, useEffect } from 'react';

export interface MultiSelectOption {
  label: string;
  value: string;
}

export interface MultiSelectOptionGroup {
  group: string;
  options: MultiSelectOption[];
}

export interface MultiSelectDropdownProps {
  label: string;
  allLabel: string;
  options: (MultiSelectOption | MultiSelectOptionGroup)[];
  value: string; // comma-separated values e.g. "Scheduled,Completed"
  onChange: (newValue: string) => void;
  style?: React.CSSProperties;
  enableSearch?: boolean;
}

function isGroup(item: MultiSelectOption | MultiSelectOptionGroup): item is MultiSelectOptionGroup {
  return 'group' in item && Array.isArray((item as MultiSelectOptionGroup).options);
}

export default function MultiSelectDropdown({
  label,
  allLabel,
  options,
  value,
  onChange,
  style,
  enableSearch = false,
}: MultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedValues = value ? value.split(',').map((v) => v.trim()).filter(Boolean) : [];

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Collect flat list of all options
  const flatOptions: MultiSelectOption[] = [];
  options.forEach((opt) => {
    if (isGroup(opt)) {
      flatOptions.push(...opt.options);
    } else {
      flatOptions.push(opt);
    }
  });

  const toggleOption = (optVal: string) => {
    let next: string[];
    if (selectedValues.includes(optVal)) {
      next = selectedValues.filter((v) => v !== optVal);
    } else {
      next = [...selectedValues, optVal];
    }
    onChange(next.join(','));
  };

  const handleSelectAll = () => {
    const allVals = flatOptions.map((o) => o.value);
    onChange(allVals.join(','));
  };

  const handleClearAll = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    onChange('');
  };

  // Button text representation
  const getButtonText = () => {
    if (selectedValues.length === 0) return allLabel;
    if (selectedValues.length === 1) {
      const match = flatOptions.find((o) => o.value === selectedValues[0]);
      return match ? match.label : selectedValues[0];
    }
    const firstMatch = flatOptions.find((o) => o.value === selectedValues[0]);
    const firstName = firstMatch ? firstMatch.label : selectedValues[0];
    return `${firstName} +${selectedValues.length - 1}`;
  };

  // Filter options if search query present
  const filterMatch = (opt: MultiSelectOption) => {
    if (!searchQuery.trim()) return true;
    return opt.label.toLowerCase().includes(searchQuery.toLowerCase());
  };

  const hasSelection = selectedValues.length > 0;

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block', ...style }}>
      {/* Trigger Pill Button */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          height: 38,
          padding: '0 10px',
          fontSize: 13,
          fontWeight: hasSelection ? 600 : 500,
          background: hasSelection ? '#ecfdf5' : '#ffffff',
          border: hasSelection ? '1.5px solid #10b981' : '1.5px solid #cbd5e1',
          color: hasSelection ? '#047857' : '#475569',
          borderRadius: 8,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'all 0.15s ease',
          userSelect: 'none',
          boxShadow: isOpen ? '0 0 0 3px rgba(16, 185, 129, 0.15)' : 'none',
        }}
      >
        <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{getButtonText()}</span>

        {hasSelection && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              background: '#10b981',
              color: '#ffffff',
              borderRadius: 10,
              padding: '1px 5px',
              minWidth: 16,
              textAlign: 'center',
              lineHeight: 1.2,
            }}
          >
            {selectedValues.length}
          </span>
        )}

        {hasSelection && (
          <span
            role="button"
            onClick={handleClearAll}
            title="Clear filter"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: '#e2e8f0',
              color: '#475569',
              fontSize: 10,
              lineHeight: 1,
              marginLeft: 2,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#fecaca';
              e.currentTarget.style.color = '#dc2626';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#e2e8f0';
              e.currentTarget.style.color = '#475569';
            }}
          >
            ✕
          </span>
        )}

        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          style={{
            width: 12,
            height: 12,
            opacity: 0.6,
            marginLeft: hasSelection ? 0 : 2,
            transition: 'transform 0.15s ease',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Fully Opaque Floating Popover Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 9999,
            minWidth: 200,
            maxWidth: 280,
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: 10,
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.18), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            padding: 6,
            animation: 'fadeIn 0.12s ease-out',
          }}
        >
          {/* Header Action Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 6px',
              borderBottom: '1px solid #f1f5f9',
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8' }}>
              {label}
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              {selectedValues.length < flatOptions.length && (
                <button
                  type="button"
                  onClick={handleSelectAll}
                  style={{
                    border: 'none',
                    background: 'none',
                    color: '#10b981',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  All
                </button>
              )}
              {hasSelection && (
                <button
                  type="button"
                  onClick={(e) => handleClearAll(e)}
                  style={{
                    border: 'none',
                    background: 'none',
                    color: '#ef4444',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Inline Search Box */}
          {(enableSearch || flatOptions.length > 6) && (
            <div style={{ marginBottom: 4 }}>
              <input
                type="text"
                placeholder={`Search ${label.toLowerCase()}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '4px 8px',
                  fontSize: 12,
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  outline: 'none',
                  background: '#f8fafc',
                }}
              />
            </div>
          )}

          {/* Options List */}
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {options.map((item, idx) => {
              if (isGroup(item)) {
                const groupMatching = item.options.filter(filterMatch);
                if (groupMatching.length === 0) return null;
                return (
                  <div key={item.group || idx} style={{ marginBottom: 4 }}>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: '#94a3b8',
                        padding: '3px 6px 2px',
                        background: '#f8fafc',
                        borderRadius: 4,
                      }}
                    >
                      {item.group}
                    </div>
                    {groupMatching.map((opt) => {
                      const isChecked = selectedValues.includes(opt.value);
                      return (
                        <div
                          key={opt.value}
                          onClick={() => toggleOption(opt.value)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '5px 8px',
                            fontSize: 12.5,
                            color: isChecked ? '#047857' : '#0f172a',
                            borderRadius: 6,
                            cursor: 'pointer',
                            userSelect: 'none',
                            fontWeight: isChecked ? 600 : 400,
                            background: isChecked ? '#ecfdf5' : '#ffffff',
                            transition: 'background 0.1s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = isChecked ? '#d1fae5' : '#f1f5f9';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = isChecked ? '#ecfdf5' : '#ffffff';
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div
                              style={{
                                width: 14,
                                height: 14,
                                borderRadius: 4,
                                border: isChecked ? '1.5px solid #10b981' : '1.5px solid #cbd5e1',
                                background: isChecked ? '#10b981' : '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.15s ease',
                                flexShrink: 0,
                              }}
                            >
                              {isChecked && (
                                <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.5" style={{ width: 10, height: 10 }}>
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </div>
                            <span>{opt.label}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              }

              if (!filterMatch(item)) return null;
              const isChecked = selectedValues.includes(item.value);
              return (
                <div
                  key={item.value}
                  onClick={() => toggleOption(item.value)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '5px 8px',
                    fontSize: 12.5,
                    color: isChecked ? '#047857' : '#0f172a',
                    borderRadius: 6,
                    cursor: 'pointer',
                    userSelect: 'none',
                    fontWeight: isChecked ? 600 : 400,
                    background: isChecked ? '#ecfdf5' : '#ffffff',
                    transition: 'background 0.1s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = isChecked ? '#d1fae5' : '#f1f5f9';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isChecked ? '#ecfdf5' : '#ffffff';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 4,
                        border: isChecked ? '1.5px solid #10b981' : '1.5px solid #cbd5e1',
                        background: isChecked ? '#10b981' : '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease',
                        flexShrink: 0,
                      }}
                    >
                      {isChecked && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.5" style={{ width: 10, height: 10 }}>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    <span>{item.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
