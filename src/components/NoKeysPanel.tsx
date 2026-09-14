import type { EnvVar } from "@/lib/hyperswitch";

// Shown wherever a page needs Hyperswitch but the keys are not in the
// environment. The rest of the storefront keeps working without them.
export default function NoKeysPanel({ vars }: { vars: EnvVar[] }) {
  return (
    <section className="rounded-lg border border-accent/40 bg-accent-soft p-6">
      <h2 className="text-lg font-semibold">Hyperswitch keys not configured</h2>
      <p className="mt-2 max-w-prose text-sm text-zinc-700">
        The storefront runs without them; taking a payment does not. Copy <code className="font-mono">.env.example</code> to{" "}
        <code className="font-mono">.env.local</code>, fill in the values below, and restart the dev server. The step-by-step
        is under &ldquo;Getting sandbox keys&rdquo; in the README.
      </p>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-accent/30 text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-2 pr-4 font-medium">Variable</th>
              <th className="py-2 pr-4 font-medium">Where it comes from</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {vars.map((variable) => (
              <tr key={variable.name} className="border-b border-accent/20 align-top last:border-0">
                <td className="py-2 pr-4 font-mono text-xs">{variable.name}</td>
                <td className="py-2 pr-4 text-zinc-700">{variable.source}</td>
                <td className="py-2 whitespace-nowrap">
                  {variable.set ? (
                    <span className="text-green-700">Set</span>
                  ) : variable.required ? (
                    <span className="font-medium text-accent">Missing</span>
                  ) : (
                    <span className="text-zinc-500">Optional</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-zinc-600">
        Sandbox keys start with <code className="font-mono">snd_</code> (secret) and <code className="font-mono">pk_snd_</code>{" "}
        (publishable). Nothing on this page is sent anywhere until they are set.
      </p>
    </section>
  );
}
