import{ createServer } from 'node:http'

const server = createServer()



const port = process.env.PORT || 3333; //localhost:xxxx
server.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`)
})

console.log('Deu')