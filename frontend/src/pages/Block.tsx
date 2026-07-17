import { useParams } from 'react-router-dom'

function Block() {
  const { blockId } = useParams()
  return <h1>Block {blockId}</h1>
}

export default Block
