export default function ArchitectureFlow() {
  return (
    <div className="relative mx-auto w-72 select-none">
      {/* CLIENT */}
      <div className="border border-zinc-700 bg-zinc-900 px-4 py-3 mx-auto w-48 text-center">
        <div className="font-mono text-xs text-zinc-500 mb-0.5">─── REQUEST ───</div>
        <div className="font-mono text-sm text-white font-semibold">CLIENT</div>
        <div className="font-mono text-xs text-zinc-600 mt-0.5">POST /api/v1/check</div>
      </div>

      {/* Arrow down: CLIENT → API */}
      <div className="relative mx-auto w-px h-12 bg-zinc-700 mt-0">
        <div
          className="absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-cyan-400 animate-flow-a"
          style={{ top: 0 }}
        />
        <div
          className="absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-cyan-400 animate-flow-b"
          style={{ top: 0 }}
        />
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[6px] border-l-transparent border-r-transparent border-t-zinc-600" />
      </div>

      {/* SHARDLEAK API */}
      <div className="border border-cyan-400/40 bg-zinc-900 px-4 py-3 mx-auto w-56 text-center shadow-[0_0_20px_rgba(34,211,238,0.08)]">
        <div className="font-mono text-xs text-cyan-400 mb-0.5">─── STATELESS ───</div>
        <div className="font-mono text-sm text-white font-semibold">SHARDLEAK API</div>
        <div className="font-mono text-xs text-zinc-500 mt-0.5">Go · Chi</div>
      </div>

      {/* Fork: two arrows down-left and down-right */}
      <div className="flex justify-center gap-16 mt-0">
        {/* Left branch: Redis */}
        <div className="flex flex-col items-center">
          <div className="relative w-px h-10 bg-zinc-700">
            <div
              className="absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-cyan-400 animate-flow-short-a"
              style={{ top: 0 }}
            />
          </div>
          <div className="border border-zinc-700 bg-zinc-900 px-3 py-2 text-center w-28">
            <div className="font-mono text-xs text-red-400 mb-0.5">LUA SCRIPT</div>
            <div className="font-mono text-sm text-white font-semibold">REDIS</div>
            <div className="font-mono text-xs text-zinc-600 mt-0.5">ATOMIC STATE</div>
          </div>
        </div>

        {/* Right branch: PostgreSQL */}
        <div className="flex flex-col items-center">
          <div className="relative w-px h-10 bg-zinc-700">
            <div
              className="absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-zinc-400 animate-flow-short-b"
              style={{ top: 0 }}
            />
          </div>
          <div className="border border-zinc-700 bg-zinc-900 px-3 py-2 text-center w-28">
            <div className="font-mono text-xs text-zinc-500 mb-0.5">PERSISTENT</div>
            <div className="font-mono text-sm text-white font-semibold">POSTGRES</div>
            <div className="font-mono text-xs text-zinc-600 mt-0.5">CONFIG</div>
          </div>
        </div>
      </div>

      {/* Arrow from Redis down to result */}
      <div className="flex justify-start ml-[2.25rem] mt-0">
        <div className="relative w-px h-10 bg-zinc-700">
          <div
            className="absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-cyan-400"
            style={{ top: 0, animation: 'flow-down-short 2s ease-in-out infinite 1.8s' }}
          />
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[6px] border-l-transparent border-r-transparent border-t-zinc-600" />
        </div>
      </div>

      {/* Result row */}
      <div className="flex gap-3 ml-[2.25rem] -mt-0">
        <div className="border border-emerald-500/40 bg-emerald-500/5 px-4 py-2 text-center">
          <div className="font-mono text-xs text-emerald-400 font-semibold">✓ ALLOW</div>
        </div>
        <div className="border border-red-500/40 bg-red-500/5 px-4 py-2 text-center">
          <div className="font-mono text-xs text-red-400 font-semibold">✗ REJECT</div>
        </div>
      </div>

      {/* Annotation */}
      <div className="mt-6 border-t border-zinc-800 pt-4 text-center">
        <div className="font-mono text-xs text-zinc-600">
          Multiple API instances share Redis state.
        </div>
        <div className="font-mono text-xs text-zinc-600 mt-0.5">
          Lua atomicity prevents race conditions.
        </div>
      </div>
    </div>
  );
}
