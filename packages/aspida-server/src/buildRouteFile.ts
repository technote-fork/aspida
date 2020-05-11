import path from 'path'
import { Config } from './getConfig'
import createRouteString from './createRouteString'

export type Template = {
  filePath: string
  text: string
}

export default ({ input, port, cors, uploader }: Config): Template[] => [
  {
    text: createRouteString(input),
    filePath: path.posix.join(input, `$controllers.ts`)
  },
  {
    text: `/* eslint-disable */${uploader.dest ?? "\nimport { tmpdir } from 'os'"}
import express from 'express'
import multer from 'multer'
import helmet from 'helmet'${cors ? "\nimport cors from 'cors'" : ''}
import { createRouter } from 'aspida-server'
import controllers from './$controllers'

express()
  .use(helmet())${cors ? '\n  .use(cors())' : ''}
  .use((req, res, next) => {
    express.json()(req, res, err => {
      if (err) return res.sendStatus(400)

      next()
    })
  })
  .use(createRouter(controllers, multer({ dest: ${
    uploader.dest ?? 'tmpdir()'
  }, limits: { fileSize: ${uploader.size ?? '1024 ** 3'} } }).any()))
  .listen(${port}, () => {
    console.log('aspida-server runs successfully.')
  })
`,
    filePath: path.posix.join(input, `$server.ts`)
  }
]
