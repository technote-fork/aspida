import createMethods from './createMethodsString'
import createDocComment from './createDocComment'
import { DirentTree, FileData } from './getDirentTree'
import { Method } from './parseInterface'
import { AspidaConfig } from './commands'

const valNameRegExpStr = '^_[a-zA-Z][a-zA-Z0-9_]*'
const valNameRegExp = new RegExp(valNameRegExpStr)
const valTypeRegExpStr = '(@number|@string)'
const valTypeRegExp = new RegExp(valTypeRegExpStr)
const toJSValidString = (text: string) =>
  text.replace(/[^a-zA-Z0-9$_]/g, '_').replace(/^(\d)/, '$$$1')

export default (
  direntTree: DirentTree,
  basePath: string,
  trailingSlash: boolean,
  outputMode: AspidaConfig['outputMode']
) => {
  const imports: string[] = []
  const pathes: string[] = []
  const getMethodsString = (
    filepath: string,
    methods: Method[],
    indent: string,
    newPrefix: string,
    newUrl: string
  ) => {
    const importName = `Methods${imports.length}`
    imports.push(`import { Methods as ${importName} } from '${filepath.replace(/'/g, "\\'")}'`)
    let newPath = `'${decodeURIComponent(newUrl)}${trailingSlash ? '/' : ''}'`
    if (newPath.length > 2) {
      if (!pathes.includes(newPath)) pathes.push(newPath)
      newPath = `PATH${pathes.indexOf(newPath)}`
    }

    return createMethods(
      methods,
      indent,
      importName,
      newPrefix && newPath.length > 2 ? `\`\${${newPrefix}}\${${newPath}}\`` : newPrefix || newPath,
      outputMode
    )
  }

  const createApiString = (
    tree: DirentTree,
    importBasePath: string,
    indent: string,
    dirDeps: number,
    prefix: string,
    url: string,
    text: string,
    methodsOfIndexTsFile?: string
  ): string => {
    const props = tree.children
      .map(dirent => {
        const filename = dirent.name
        const filenameNextJs = /^\[[a-zA-Z0-9]+]\.ts$/.test(dirent.name)
          ? dirent.name.replace(/^\[([a-zA-Z0-9]+)]\.ts$/, '_$1')
          : dirent.name
        const basenameNextJs = dirent.isDir ? filename : filenameNextJs.replace(/\.ts$/, '')
        const basename = dirent.isDir ? filename : filename.replace(/\.ts$/, '')
        const hasVal = filenameNextJs.startsWith('_')
        let valFn = `${indent}${toJSValidString(
          decodeURIComponent(basenameNextJs)
        )}: {\n<% next %>\n${indent}}`
        let newPrefix = prefix
        let newUrl = `${url}/${basenameNextJs}`

        if (hasVal) {
          const valPathRegExp = new RegExp(
            `${valNameRegExpStr}${valTypeRegExpStr}?((\\.|%[0-9a-fA-F]{2})[a-zA-Z0-9]+)?$`
          )
          if (!valPathRegExp.test(basenameNextJs)) {
            throw new Error(
              `aspida \u001b[43m\u001b[31mERROR\u001b[0m '${basenameNextJs}' does not match '${valPathRegExp.toString()}'.`
            )
          }

          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const valName = basenameNextJs.match(valNameRegExp)![0]
          const valType = basenameNextJs.replace(valName, '').startsWith('@')
            ? basenameNextJs.split('@')[1].slice(0, 6)
            : null
          const postfix = decodeURIComponent(
            basenameNextJs.replace(valName, '').replace(valType ? `@${valType}` : '', '')
          )
          const prevUrl = `'${decodeURIComponent(url)}${trailingSlash ? '/' : ''}'`
          if (url.length && !pathes.includes(prevUrl)) pathes.push(prevUrl)

          const duplicatedNames = tree.children.filter(d => d.name.startsWith(valName))
          const prefixVal = `\`${prefix ? `\${${prefix}}` : ''}${
            url.length ? `\${PATH${pathes.indexOf(prevUrl)}}` : ''
          }${url.length && trailingSlash ? '' : '/'}\${val${dirDeps}}${postfix}\``

          newPrefix = `prefix${dirDeps}`
          newUrl = ''
          valFn = `${indent}${toJSValidString(valName)}${
            duplicatedNames.length > 1 && valType ? `_${valType}` : ''
          }${toJSValidString(postfix)}: (val${dirDeps}: ${
            valType ?? 'number | string'
          }) => {\n${indent}  const ${newPrefix} = ${prefixVal}\n\n${indent}  return {\n<% next %>\n${indent}  }\n${indent}}`
        }

        const fallbackSpecialCharsProp = (text: string) =>
          /%[0-9a-fA-F]{2}/.test(basenameNextJs)
            ? `${text},\n${text.replace(
                /^( +?)[^ ]+?:/,
                `$1/**\n$1 * @deprecated \`${toJSValidString(
                  basenameNextJs.replace(valTypeRegExp, '')
                )}\` has been deprecated.\n$1 * Use \`${toJSValidString(
                  decodeURIComponent(basenameNextJs.replace(valTypeRegExp, ''))
                )}\` instead\n$1 */\n$1${toJSValidString(
                  basenameNextJs.replace(valTypeRegExp, '')
                )}:`
              )}`
            : text

        if (dirent.isDir) {
          const methodsOfIndexTsFile =
            tree.children.find(c => c.name === `${filename}.ts`) ??
            dirent.tree.children.find(c => c.name === 'index.ts')

          return fallbackSpecialCharsProp(
            createApiString(
              dirent.tree,
              `${importBasePath}/${filename}`,
              `${indent}${hasVal ? '  ' : ''}  `,
              dirDeps + 1,
              newPrefix,
              newUrl,
              `${createDocComment(indent, (<FileData>methodsOfIndexTsFile)?.doc)}${valFn.replace(
                '<% next %>',
                '<% props %>'
              )}`,
              methodsOfIndexTsFile?.isDir === false
                ? getMethodsString(
                    `${importBasePath}/${filename}`,
                    methodsOfIndexTsFile.methods,
                    `${indent}${hasVal ? '  ' : ''}`,
                    newPrefix,
                    newUrl
                  )
                : undefined
            )
          )
        } else if (filename !== 'index.ts' && tree.children.every(d => d.name !== basename)) {
          return fallbackSpecialCharsProp(
            `${createDocComment(indent, dirent.doc)}${valFn.replace(
              '<% next %>',
              getMethodsString(
                `${importBasePath}/${basename}`,
                dirent.methods,
                `${indent}${hasVal ? '  ' : ''}`,
                newPrefix,
                newUrl
              )
            )}`
          )
        }

        return null
      })
      .filter((p): p is string => !!p)

    return text.replace(
      '<% props %>',
      `${props.join(',\n')}${
        methodsOfIndexTsFile ? `${props.length ? ',\n' : ''}${methodsOfIndexTsFile}` : ''
      }`
    )
  }

  const emptyMethodsRegExp = /.+{\n\n? +},?\n/
  const rootIndexData = direntTree.children.find(c => c.name === 'index.ts')

  /* eslint-disable no-template-curly-in-string */
  let api = createApiString(
    direntTree,
    '.',
    '    ',
    0,
    '',
    basePath,
    `{\n<% props %>\n  }`,
    rootIndexData && !rootIndexData.isDir
      ? getMethodsString('.', rootIndexData.methods, '  ', '', basePath)
      : undefined
  )

  while (emptyMethodsRegExp.test(api)) {
    api = api.replace(emptyMethodsRegExp, '')
  }

  return { api, imports, pathes }
}
