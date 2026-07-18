import { Outlet } from 'react-router-dom'
import PhoneFrame from './PhoneFrame'

function DemoLayout() {
  return (
    <PhoneFrame>
      <Outlet />
    </PhoneFrame>
  )
}

export default DemoLayout
