import { useEffect } from 'react'
import { Layout } from './components/Layout'
import { useBook } from './lib/books'
import { useRoute } from './lib/router'
import { useSettings } from './lib/store'
import { Home } from './pages/Home'
import { Me } from './pages/Me'
import { Mock } from './pages/Mock'
import { Practice } from './pages/Practice'
import { PracticeRun } from './pages/PracticeRun'
import { Quiz } from './pages/Quiz'
import { Study } from './pages/Study'
import { Words } from './pages/Words'

export function App() {
  const { path, query } = useRoute()
  const settings = useSettings()
  const book = useBook(settings.book)

  // 切换页面时回到顶部；做题页换一套题也回到顶部
  const scrollKey = path === '/practice/run' ? `${path}?${query.toString()}` : path
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [scrollKey])

  const focus = path === '/study' || (path === '/quiz' && query.get('run') === '1') || path === '/practice/run' || path === '/practice/mock'

  let page
  switch (path) {
    case '/study':
      page = <Study key={query.toString()} book={book} extra={Number(query.get('extra')) || 0} />
      break
    case '/quiz':
      page = <Quiz book={book} query={query} />
      break
    case '/practice':
      page = <Practice />
      break
    case '/practice/mock':
      page = <Mock key={query.toString()} query={query} />
      break
    case '/practice/run':
      page = <PracticeRun query={query} />
      break
    case '/words':
      page = <Words book={book} query={query} />
      break
    case '/me':
      page = <Me query={query} />
      break
    default:
      page = <Home book={book} />
  }

  return (
    <Layout path={path} focus={focus}>
      {page}
    </Layout>
  )
}
