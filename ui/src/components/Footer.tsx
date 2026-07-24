import PulseLogo from './PulseLogo'

export default function Footer() {
  return (
    <footer className="border-t border-zinc-800 py-6 text-center text-xs text-zinc-500">
      <p>
        <a
          href="https://pulse-broadcast.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-300 hover:underline"
        >
          <PulseLogo className="h-4 w-4 text-[#f23939]" />
          Powered by Pulse Broadcast
        </a>
        <span className="ml-1.5 font-mono text-zinc-600">v{__APP_VERSION__}</span>
      </p>
      <p>
        Developed by{' '}
        <a
          href="http://github.com/alexandrucancescu"
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-400 hover:text-zinc-300 hover:underline"
        >
          Alexandru C&#259;ncescu
        </a>
      </p>
    </footer>
  )
}
