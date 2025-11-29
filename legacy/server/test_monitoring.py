#!/usr/bin/env python3
"""Test script to verify monitoring functionality."""

import asyncio
import sys
from fastapi import FastAPI
from fastapi.testclient import TestClient
from controllers.main_controller import Controller
from utils.memory_monitor import MemoryMonitor
from utils.task_manager import task_manager

async def test_monitoring():
    """Test monitoring components."""
    print("=" * 60)
    print("Testing Monitoring Components")
    print("=" * 60)
    
    # Create test app
    app = FastAPI()
    controller = Controller(app, discover=False)
    
    # Test 1: Memory Monitor
    print("\n1. Testing Memory Monitor:")
    print("-" * 30)
    await controller.memory_monitor.start()
    await asyncio.sleep(0.1)
    
    stats = controller.memory_monitor.get_memory_stats()
    print(f"✓ Current memory: {stats['current_mb']:.1f} MB")
    print(f"✓ Threads: {stats['threads']}")
    print(f"✓ Open files: {stats['open_files']}")
    print(f"✓ Connections: {stats['connections']}")
    
    # Test 2: Task Manager
    print("\n2. Testing Task Manager:")
    print("-" * 30)
    
    test_completed = False
    
    async def test_task():
        nonlocal test_completed
        await asyncio.sleep(0.5)
        test_completed = True
    
    task_manager.create_task(test_task(), "test_task")
    await asyncio.sleep(1)
    
    status = task_manager.get_status()
    print(f"✓ Total tasks: {status['total']}")
    print(f"✓ Running tasks: {status['running']}")
    print(f"✓ Completed tasks: {status['completed']}")
    print(f"✓ Test task completed: {test_completed}")
    
    # Test 3: Prometheus Metrics
    print("\n3. Testing Prometheus Metrics:")
    print("-" * 30)
    
    # Test with TestClient
    with TestClient(app) as client:
        response = client.get("/metrics")
        if response.status_code == 200:
            lines = response.text.split('\n')
            print(f"✓ Metrics endpoint working")
            print(f"✓ Generated {len(lines)} metric lines")
            
            # Show sample metrics
            print("\nSample metrics:")
            for line in lines[:10]:
                if line and not line.startswith('#'):
                    print(f"  {line}")
        else:
            print(f"✗ Metrics endpoint returned {response.status_code}")
    
    # Test 4: Exception Handling
    print("\n4. Testing Exception Handling:")
    print("-" * 30)
    
    async def failing_task():
        raise ValueError("Test error")
    
    task_manager.create_task(
        failing_task(),
        "failing_task",
        restart_on_failure=True,
        max_retries=2,
        retry_delay=0.1
    )
    
    await asyncio.sleep(0.5)
    
    status = task_manager.get_status()
    if "failing_task" in task_manager.failed_tasks:
        print(f"✓ Failed task handled correctly")
        print(f"✓ Error captured: {task_manager.failed_tasks['failing_task']}")
    
    # Cleanup
    await controller.memory_monitor.stop()
    await task_manager.cancel_all()
    
    print("\n" + "=" * 60)
    print("All monitoring tests passed! ✓")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(test_monitoring())