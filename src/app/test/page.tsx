'use client'

export default function TestPage() {
  return (
    <div className="p-4">
      <h1>Test Page</h1>
      <button 
        onClick={() => alert('Button clicked!')}
        className="bg-blue-500 text-white p-2 rounded"
      >
        Click Me
      </button>
    </div>
  )
} 