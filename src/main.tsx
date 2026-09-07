import { createRoot } from 'react-dom/client'
import { App } from '@/App'

// Load order is cascade order: tokens, reset, type, then layout and components.
import '@/styles/tokens.css'
import '@/styles/base.css'
import '@/styles/typography.css'
import '@/styles/layout.css'
import '@/styles/nav.css'
import '@/styles/chapters.css'
import '@/styles/product.css'
import '@/styles/ui.css'

/**
 * Entry point.
 *
 * Deliberately no `StrictMode`. Its double-invoked effects would run the boot
 * sequence twice and, worse, run the dispose-on-unmount cleanup between the two
 * passes — handing the second canvas a disposed material set. The scene's own
 * lifecycle is already explicit (one boot, one `dispose()` on real unmount), so
 * the extra pass would only test a scenario this app never has.
 */
const container = document.getElementById('root')
if (!container) throw new Error('#root is missing from index.html')

createRoot(container).render(<App />)
