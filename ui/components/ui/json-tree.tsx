'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Expand, Minimize, Code, Eye, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface JsonTreeProps {
  data: any;
  level?: number;
  name?: string;
  expandedPaths?: Set<string>;
  onToggleExpansion?: (path: string) => void;
  basePath?: string;
  showControls?: boolean;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
  onToggleRawView?: () => void;
  isRawView?: boolean;
  onCopyJson?: () => void;
}

const JsonTree = ({ 
  data, 
  level = 0, 
  name, 
  expandedPaths, 
  onToggleExpansion, 
  basePath = '',
  showControls = false,
  onExpandAll,
  onCollapseAll,
  onToggleRawView,
  isRawView = false,
  onCopyJson
}: JsonTreeProps) => {
  const currentPath = basePath + (name ? `.${name}` : '');
  const isExpandedExternal = expandedPaths?.has(currentPath) ?? false;
  const [isExpandedInternal, setIsExpandedInternal] = useState(level < 2);
  const [copySuccess, setCopySuccess] = useState(false);
  const isExpanded = expandedPaths ? isExpandedExternal : isExpandedInternal;
  
  const indent = level * 16;
  
  const handleToggle = () => {
    if (expandedPaths && onToggleExpansion) {
      onToggleExpansion(currentPath);
    } else {
      setIsExpandedInternal(!isExpandedInternal);
    }
  };
  
  const renderValue = (value: any, key?: string): JSX.Element => {
    if (value === null) {
      return <span className="text-gray-500 italic">null</span>;
    }
    
    if (value === undefined) {
      return <span className="text-gray-500 italic">undefined</span>;
    }
    
    if (typeof value === 'string') {
      return <span className="text-green-600">"{value}"</span>;
    }
    
    if (typeof value === 'number') {
      return <span className="text-blue-600">{value}</span>;
    }
    
    if (typeof value === 'boolean') {
      return <span className="text-purple-600">{value.toString()}</span>;
    }
    
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span className="text-gray-500">[]</span>;
      }
      
      return (
        <div>
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggle}
              className="h-4 w-4 p-0 mr-1 transition-transform duration-150 text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200"
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </Button>
            <span className="text-gray-700">
              [{value.length} {value.length === 1 ? 'item' : 'items'}]
            </span>
          </div>
          {isExpanded && (
            <div className="ml-4 animate-in slide-in-from-top-2 duration-200">
              {value.map((item, index) => (
                <div key={index} className="flex">
                  <span className="text-gray-500 mr-2 font-mono text-xs">{index}:</span>
                  <div className="flex-1">
                    <JsonTree 
                      data={item} 
                      level={level + 1} 
                      expandedPaths={expandedPaths}
                      onToggleExpansion={onToggleExpansion}
                      basePath={`${currentPath}[${index}]`}
                      showControls={false}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    
    if (typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.length === 0) {
        return <span className="text-gray-500">{'{}'}</span>;
      }
      
      return (
        <div>
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggle}
              className="h-4 w-4 p-0 mr-1 transition-transform duration-150 text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200"
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </Button>
            <span className="text-gray-700">
              {'{'}...{'}'} ({keys.length} {keys.length === 1 ? 'key' : 'keys'})
            </span>
          </div>
          {isExpanded && (
            <div className="ml-4 animate-in slide-in-from-top-2 duration-200">
              {keys.map((objKey) => (
                <div key={objKey} className="flex">
                  <span className="text-blue-800 font-medium mr-2 font-mono text-xs">
                    "{objKey}":
                  </span>
                  <div className="flex-1">
                    <JsonTree 
                      data={value[objKey]} 
                      level={level + 1} 
                      name={objKey}
                      expandedPaths={expandedPaths}
                      onToggleExpansion={onToggleExpansion}
                      basePath={currentPath}
                      showControls={false}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    
    return <span className="text-gray-600">{String(value)}</span>;
  };
  
  const handleCopyJson = async () => {
    try {
      const jsonText = JSON.stringify(data, null, 2);
      await navigator.clipboard.writeText(jsonText);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
      if (onCopyJson) {
        onCopyJson();
      }
    } catch (err) {
      console.error('Failed to copy JSON:', err);
    }
  };

  // If this is the root level and we're showing raw view, display raw JSON
  if (level === 0 && isRawView) {
    return (
      <div className="font-mono text-xs">
        {showControls && (
          <div className="flex items-center gap-2 mb-2 pb-2 border-b">
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleRawView}
              className="h-6 text-xs"
              title="Switch to tree view"
            >
              <Eye className="h-3 w-3 mr-1" />
              Tree View
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyJson}
              className="h-6 text-xs"
              title="Copy JSON to clipboard"
            >
              {copySuccess ? (
                <>
                  <Check className="h-3 w-3 mr-1 text-green-600" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 mr-1" />
                  Copy
                </>
              )}
            </Button>
          </div>
        )}
        <pre className="whitespace-pre-wrap text-gray-800 bg-gray-50 p-2 rounded text-xs overflow-auto max-h-96">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    );
  }

  return (
    <div style={{ marginLeft: `${indent}px` }} className="font-mono text-xs">
      {/* Controls at root level */}
      {level === 0 && showControls && (
        <div className="flex items-center gap-2 mb-2 pb-2 border-b">
          <Button
            variant="outline"
            size="sm"
            onClick={onExpandAll}
            className="h-6 text-xs"
            title="Expand all nested objects"
          >
            <Expand className="h-3 w-3 mr-1" />
            Expand All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onCollapseAll}
            className="h-6 text-xs"
            title="Collapse all nested objects"
          >
            <Minimize className="h-3 w-3 mr-1" />
            Collapse All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleRawView}
            className="h-6 text-xs"
            title="View raw JSON"
          >
            <Code className="h-3 w-3 mr-1" />
            Raw JSON
          </Button>
        </div>
      )}
      
      {name && (
        <span className="text-blue-800 font-medium mr-2">"{name}":</span>
      )}
      {renderValue(data)}
    </div>
  );
};

export default JsonTree;