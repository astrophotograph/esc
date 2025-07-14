'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ArrowLeft, ArrowDown, ArrowUp, RefreshCw, ChevronDown, ChevronRight, Link, Filter, Clock, Play, Pause } from 'lucide-react';
import { useRouter } from 'next/navigation';
import JsonTree from '@/components/ui/json-tree';

interface TelescopeMessage {
  timestamp: string;
  direction: 'sent' | 'received';
  message: string;
}

interface MessagesResponse {
  messages: TelescopeMessage[];
  error?: string;
}

interface ParsedMessage {
  id?: number;
  method?: string;
  Event?: string;
  result?: any;
  error?: any;
  raw: string;
}

interface MessagePair {
  request: TelescopeMessage & { parsed: ParsedMessage };
  response?: TelescopeMessage & { parsed: ParsedMessage };
}

export default function MessagesPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<TelescopeMessage[]>([]);
  const [telescopes, setTelescopes] = useState<string[]>([]);
  const [selectedTelescope, setSelectedTelescope] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [expandedJsonPaths, setExpandedJsonPaths] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<string>('all');
  const [customMinutes, setCustomMinutes] = useState<string>('5');
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch available telescopes
  useEffect(() => {
    const fetchTelescopes = async () => {
      try {
        const response = await fetch('/api/telescopes');
        if (response.ok) {
          const data = await response.json();
          const telescopeNames = data.map((t: any) => t.name);
          setTelescopes(telescopeNames);
          if (telescopeNames.length > 0) {
            setSelectedTelescope(telescopeNames[0]);
          }
        }
      } catch (err) {
        console.error('Failed to fetch telescopes:', err);
      }
    };
    
    fetchTelescopes();
  }, []);

  // Fetch messages for selected telescope
  const fetchMessages = async () => {
    if (!selectedTelescope) return;
    
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/telescopes/${selectedTelescope}/messages`);
      if (response.ok) {
        const data: MessagesResponse = await response.json();
        setMessages(data.messages || []);
        if (data.error) {
          setError(data.error);
        }
      } else {
        setError(`Failed to fetch messages: ${response.statusText}`);
      }
    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Fetch messages when telescope selection changes
  useEffect(() => {
    if (selectedTelescope) {
      fetchMessages();
    }
  }, [selectedTelescope]);

  // Auto-refresh every 5 seconds (when not paused)
  useEffect(() => {
    if (!selectedTelescope || isPaused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    
    intervalRef.current = setInterval(fetchMessages, 5000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [selectedTelescope, isPaused]);

  // Clear expansion state when telescope changes
  useEffect(() => {
    setExpandedMessages(new Set());
    setExpandedJsonPaths(new Set());
  }, [selectedTelescope]);

  const formatTimestamp = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return timestamp;
    }
  };

  const parseMessage = (message: string): ParsedMessage => {
    try {
      const parsed = JSON.parse(message);
      return {
        id: parsed.id,
        method: parsed.method,
        Event: parsed.Event,
        result: parsed.result,
        error: parsed.error,
        raw: message
      };
    } catch {
      return { raw: message };
    }
  };

  const getMessageType = (parsed: ParsedMessage): string => {
    if (parsed.Event) return `Event: ${parsed.Event}`;
    if (parsed.method) return `Command: ${parsed.method}`;
    if (parsed.result !== undefined || parsed.error !== undefined) return `Response`;
    return 'Unknown';
  };

  const getMessageSummary = (parsed: ParsedMessage): string => {
    if (parsed.Event) return parsed.Event;
    if (parsed.method) return parsed.method;
    if (parsed.result !== undefined) return `Response (ID: ${parsed.id})`;
    if (parsed.error !== undefined) return `Error (ID: ${parsed.id})`;
    return parsed.raw.length > 50 ? parsed.raw.substring(0, 50) + '...' : parsed.raw;
  };

  const parseJsonSafely = (message: string) => {
    try {
      return JSON.parse(message);
    } catch {
      return message;
    }
  };

  // Create request-response pairs
  const createMessagePairs = (messages: TelescopeMessage[]): (MessagePair | TelescopeMessage)[] => {
    const result: (MessagePair | TelescopeMessage)[] = [];
    const pendingRequests = new Map<number, TelescopeMessage & { parsed: ParsedMessage }>();

    messages.forEach(msg => {
      const parsed = parseMessage(msg.message);
      const enrichedMsg = { ...msg, parsed };

      if (msg.direction === 'sent' && parsed.id !== undefined && parsed.method) {
        // This is a request
        pendingRequests.set(parsed.id, enrichedMsg);
        result.push({ request: enrichedMsg });
      } else if (msg.direction === 'received' && parsed.id !== undefined && (parsed.result !== undefined || parsed.error !== undefined)) {
        // This is a response
        const pairIndex = result.findIndex(item => 
          'request' in item && item.request.parsed.id === parsed.id
        );
        
        if (pairIndex !== -1) {
          (result[pairIndex] as MessagePair).response = enrichedMsg;
          pendingRequests.delete(parsed.id);
        } else {
          // Orphaned response
          result.push(enrichedMsg);
        }
      } else {
        // Event or other message
        result.push(enrichedMsg);
      }
    });

    return result;
  };

  // Generate a stable ID for messages to persist expansion state
  const generateMessageId = (msg: TelescopeMessage, index: number): string => {
    // Try to use message ID if it's a JSON-RPC message
    try {
      const parsed = JSON.parse(msg.message);
      if (parsed.id !== undefined) {
        return `${msg.direction}-${parsed.id}-${msg.timestamp}`;
      }
    } catch {
      // Not JSON or no ID
    }
    
    // Fallback to timestamp + direction + content hash for stable ID
    const contentHash = msg.message.length.toString() + msg.message.slice(0, 50);
    return `${msg.direction}-${msg.timestamp}-${contentHash}`;
  };

  const generatePairId = (pair: MessagePair): string => {
    // Use request message ID for pair identification
    const requestId = generateMessageId(pair.request, 0);
    return `pair-${requestId}`;
  };

  const toggleExpanded = (messageId: string) => {
    const newExpanded = new Set(expandedMessages);
    if (newExpanded.has(messageId)) {
      newExpanded.delete(messageId);
    } else {
      newExpanded.add(messageId);
    }
    setExpandedMessages(newExpanded);
  };

  const toggleJsonExpansion = (path: string) => {
    const newExpanded = new Set(expandedJsonPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedJsonPaths(newExpanded);
  };

  // Filter messages based on type and time
  const filterMessages = (messages: TelescopeMessage[]): TelescopeMessage[] => {
    let filtered = [...messages];

    // Time filtering
    if (timeFilter !== 'all') {
      const now = new Date();
      let cutoffTime: Date;

      switch (timeFilter) {
        case '1min':
          cutoffTime = new Date(now.getTime() - 1 * 60 * 1000);
          break;
        case '5min':
          cutoffTime = new Date(now.getTime() - 5 * 60 * 1000);
          break;
        case '15min':
          cutoffTime = new Date(now.getTime() - 15 * 60 * 1000);
          break;
        case '1hour':
          cutoffTime = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case 'custom':
          const minutes = parseInt(customMinutes) || 5;
          cutoffTime = new Date(now.getTime() - minutes * 60 * 1000);
          break;
        default:
          cutoffTime = new Date(0);
      }

      filtered = filtered.filter(msg => {
        try {
          const msgTime = new Date(msg.timestamp);
          return msgTime >= cutoffTime;
        } catch {
          return true; // Keep messages with invalid timestamps
        }
      });
    }

    // Type filtering
    if (typeFilter !== 'all') {
      filtered = filtered.filter(msg => {
        const parsed = parseMessage(msg.message);
        const messageType = getMessageType(parsed).toLowerCase();
        
        switch (typeFilter) {
          case 'commands':
            return messageType.includes('command');
          case 'events':
            return messageType.includes('event');
          case 'responses':
            return messageType.includes('response');
          case 'errors':
            return parsed.error !== undefined;
          default:
            return true;
        }
      });
    }

    return filtered;
  };

  // Get unique message types for filter dropdown
  const getMessageTypes = (messages: TelescopeMessage[]): string[] => {
    const types = new Set<string>();
    messages.forEach(msg => {
      const parsed = parseMessage(msg.message);
      if (parsed.Event) types.add('events');
      if (parsed.method) types.add('commands');
      if (parsed.result !== undefined || parsed.error !== undefined) types.add('responses');
      if (parsed.error !== undefined) types.add('errors');
    });
    return Array.from(types);
  };

  const scrollToBottom = () => {
    const element = document.getElementById('messages-end');
    element?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToTop = () => {
    const element = document.getElementById('messages-start');
    element?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Telescope Messages</h1>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPaused(!isPaused)}
            title={isPaused ? 'Resume auto-refresh' : 'Pause auto-refresh'}
          >
            {isPaused ? (
              <Play className="h-4 w-4" />
            ) : (
              <Pause className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchMessages}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={scrollToTop}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={scrollToBottom}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Telescope Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Select Telescope</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {telescopes.map((telescope) => (
              <Button
                key={telescope}
                variant={selectedTelescope === telescope ? "default" : "outline"}
                onClick={() => setSelectedTelescope(telescope)}
              >
                {telescope}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Message Type</label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="commands">Commands</SelectItem>
                  <SelectItem value="events">Events</SelectItem>
                  <SelectItem value="responses">Responses</SelectItem>
                  <SelectItem value="errors">Errors</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Time Range</label>
              <Select value={timeFilter} onValueChange={setTimeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="1min">Last Minute</SelectItem>
                  <SelectItem value="5min">Last 5 Minutes</SelectItem>
                  <SelectItem value="15min">Last 15 Minutes</SelectItem>
                  <SelectItem value="1hour">Last Hour</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {timeFilter === 'custom' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Minutes</label>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <Input
                    type="number"
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(e.target.value)}
                    placeholder="5"
                    min="1"
                    className="w-20"
                  />
                  <span className="text-sm text-gray-500">min</span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Messages Display */}
      <Card className="h-[70vh]">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              Messages {selectedTelescope && `- ${selectedTelescope}`}
              {isPaused && (
                <span className="text-sm text-orange-600 font-normal">(Paused)</span>
              )}
            </CardTitle>
            <Badge variant="secondary">
              {filterMessages(messages).length} of {messages.length} messages
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <div className="p-4 text-red-600 bg-red-50 border-b">
              {error}
            </div>
          )}
          
          <ScrollArea className="h-full">
            <div id="messages-start">
              {(() => {
                const filteredMessages = filterMessages(messages);
                if (messages.length === 0) {
                  return (
                    <div className="text-center text-gray-500 py-8">
                      {loading ? 'Loading messages...' : 'No messages available'}
                    </div>
                  );
                }
                if (filteredMessages.length === 0) {
                  return (
                    <div className="text-center text-gray-500 py-8">
                      No messages match the current filters
                    </div>
                  );
                }
                return (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Timestamp</TableHead>
                      <TableHead className="w-[100px]">Direction</TableHead>
                      <TableHead className="w-[150px]">Type</TableHead>
                      <TableHead>Summary</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="transition-all duration-300 ease-in-out">
                    {createMessagePairs(filteredMessages).map((item, index) => {
                      if ('request' in item) {
                        // This is a request-response pair
                        const pair = item as MessagePair;
                        const pairId = generatePairId(pair);
                        const isExpanded = expandedMessages.has(pairId);
                        return (
                          <>
                            <TableRow key={`pair-${index}`} className="border-b transition-colors duration-200 hover:bg-slate-50/50">
                              <TableCell className="font-mono text-xs">
                                {formatTimestamp(pair.request.timestamp)}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Badge variant="default" className="text-xs">
                                    SENT
                                  </Badge>
                                  {pair.response && (
                                    <>
                                      <Link className="h-3 w-3 text-gray-400" />
                                      <Badge variant="secondary" className="text-xs">
                                        RECV
                                      </Badge>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {getMessageType(pair.request.parsed)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  <div>{getMessageSummary(pair.request.parsed)}</div>
                                  {pair.response && (
                                    <div className="text-gray-600 text-sm">
                                      → {getMessageSummary(pair.response.parsed)}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Collapsible>
                                  <CollapsibleTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => toggleExpanded(pairId)}
                                      className="h-6 w-6 p-0"
                                    >
                                      {isExpanded ? (
                                        <ChevronDown className="h-4 w-4" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </CollapsibleTrigger>
                                </Collapsible>
                              </TableCell>
                            </TableRow>
                            {isExpanded && (
                              <TableRow key={`pair-expanded-${index}`} className="animate-in slide-in-from-top-2 duration-200">
                                <TableCell colSpan={5} className="bg-gray-50 p-4 transition-all duration-200">
                                  <div className="space-y-4">
                                    <div>
                                      <div className="font-semibold text-sm mb-2 text-gray-900">Request:</div>
                                      <div className="bg-white p-3 rounded border text-xs">
                                        <JsonTree 
                                          data={parseJsonSafely(pair.request.message)} 
                                          expandedPaths={expandedJsonPaths}
                                          onToggleExpansion={toggleJsonExpansion}
                                          basePath={`req-${pairId}`}
                                        />
                                      </div>
                                    </div>
                                    {pair.response && (
                                      <div>
                                        <div className="font-semibold text-sm mb-2 text-gray-900">
                                          Response ({formatTimestamp(pair.response.timestamp)}):
                                        </div>
                                        <div className="bg-white p-3 rounded border text-xs">
                                          <JsonTree 
                                            data={parseJsonSafely(pair.response.message)} 
                                            expandedPaths={expandedJsonPaths}
                                            onToggleExpansion={toggleJsonExpansion}
                                            basePath={`res-${pairId}`}
                                          />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </>
                        );
                      } else {
                        // This is a standalone message
                        const msg = item as TelescopeMessage;
                        const parsed = parseMessage(msg.message);
                        const msgId = generateMessageId(msg, index);
                        const isExpanded = expandedMessages.has(msgId);
                        return (
                          <>
                            <TableRow key={`msg-${index}`} className="border-b transition-colors duration-200 hover:bg-slate-50/50">
                              <TableCell className="font-mono text-xs">
                                {formatTimestamp(msg.timestamp)}
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  variant={msg.direction === 'sent' ? 'default' : 'secondary'}
                                  className="text-xs"
                                >
                                  {msg.direction.toUpperCase()}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {getMessageType(parsed)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {getMessageSummary(parsed)}
                              </TableCell>
                              <TableCell>
                                <Collapsible>
                                  <CollapsibleTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => toggleExpanded(msgId)}
                                      className="h-6 w-6 p-0"
                                    >
                                      {isExpanded ? (
                                        <ChevronDown className="h-4 w-4" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </CollapsibleTrigger>
                                </Collapsible>
                              </TableCell>
                            </TableRow>
                            {isExpanded && (
                              <TableRow key={`msg-expanded-${index}`} className="animate-in slide-in-from-top-2 duration-200">
                                <TableCell colSpan={5} className="bg-gray-50 p-4 transition-all duration-200">
                                  <div className="bg-white p-3 rounded border text-xs">
                                    <JsonTree 
                                      data={parseJsonSafely(msg.message)} 
                                      expandedPaths={expandedJsonPaths}
                                      onToggleExpansion={toggleJsonExpansion}
                                      basePath={`msg-${msgId}`}
                                    />
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </>
                        );
                      }
                    })}
                  </TableBody>
                </Table>
                );
              })()}
              <div id="messages-end" />
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}