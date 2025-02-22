import { resolve } from 'node:path'
import ora from 'ora'
import { DataSource } from 'typeorm'
import { Arguments, Argv, CommandModule, showHelp } from 'yargs'
import { Seeder } from '../seeder'
import { useSeeders } from '../helpers/useSeeders'
import { calculateFilePath } from '../utils/fileHandling'
import type { Constructable } from '../types'
import { useDataSource } from '../helpers'

interface SeedCommandArguments extends Arguments {
  dataSource?: string
  path?: string
}

export class SeedCommand implements CommandModule {
  command = 'seed <path>'
  describe = 'Runs the seeders'

  /**
   * @inheritdoc
   */
  builder(args: Argv) {
    return args
      .option('d', {
        alias: 'dataSource',
        type: 'string',
        describe: 'Path to the file where your DataSource instance is defined.',
        required: true,
      })
      .fail((message, error: Error) => {
        if (error) throw error // preserve stack
        else {
          console.error(message)
          showHelp()
        }
      })
  }

  /**
   * @inheritdoc
   */
  async handler(args: SeedCommandArguments) {
    const spinner = ora({ isSilent: process.env.NODE_ENV === 'test' }).start()

    spinner.start('Loading datasource')
    let dataSource!: DataSource
    try {
      const dataSourcePath = resolve(process.cwd(), args.dataSource as string)

      dataSource = await SeedCommand.loadDataSource(dataSourcePath)

      spinner.succeed('Datasource loaded')
    } catch (error) {
      spinner.fail('Could not load the data source!')
      throw error
    }

    spinner.start('Importing seeders')
    let seeders!: Constructable<Seeder>[]
    try {
      const absolutePath = resolve(process.cwd(), args.path as string)
      const seederFiles = calculateFilePath(absolutePath)

      seeders = await SeedCommand.loadSeeders(seederFiles)

      spinner.succeed('Seeder imported')
    } catch (error) {
      spinner.fail('Could not load seeders!')
      await dataSource.destroy()
      throw error
    }

    // Run seeder
    spinner.start(`Executing seeders`)
    try {
      await useDataSource(dataSource)

      for (const seeder of seeders) {
        await useSeeders(seeder)
        spinner.succeed(`Seeder ${seeder.name} executed`)
      }
    } catch (error) {
      spinner.fail('Could not execute seeder!')
      await dataSource.destroy()
      throw error
    }

    spinner.succeed('Finished seeding')
    await dataSource.destroy()
  }

  static async loadDataSource(dataSourceFilePath: string): Promise<DataSource> {
    let dataSourceFileExports
    try {
      dataSourceFileExports = await import(dataSourceFilePath)
    } catch (err) {
      throw new Error(`Unable to open file: "${dataSourceFilePath}"`)
    }

    if (!dataSourceFileExports || typeof dataSourceFileExports !== 'object') {
      throw new Error(`Given data source file must contain export of a DataSource instance`)
    }

    const dataSourceExports: DataSource[] = []
    for (const fileExport in dataSourceFileExports) {
      const dataSourceExport = dataSourceFileExports[fileExport]
      if (dataSourceExport instanceof DataSource) {
        dataSourceExports.push(dataSourceExport)
      }
    }

    if (dataSourceExports.length === 0) {
      throw new Error(`Given data source file must contain export of a DataSource instance`)
    }
    if (dataSourceExports.length > 1) {
      throw new Error(`Given data source file must contain only one export of DataSource instance`)
    }

    const dataSource = dataSourceExports[0]
    dataSource.setOptions({
      synchronize: false,
      migrationsRun: false,
      dropSchema: false,
      logging: false,
    })
    await dataSource.initialize()

    return dataSource
  }

  static async loadSeeders(seederPaths: string[]): Promise<Constructable<Seeder>[]> {
    let seederFileExports
    try {
      seederFileExports = await Promise.all(seederPaths.map((seederFile) => import(seederFile))).then(
        (seederExports) => {
          return seederExports
            .map((seederExport) => seederExport.default)
            .filter((seederExport) => Boolean(seederExport))
        },
      )
    } catch (err) {
      throw new Error(`Unable to open files ${(err as Error).message}`)
    }

    if (seederFileExports.length === 0) {
      throw new Error(`No default seeders found`)
    }

    const seeders: Constructable<Seeder>[] = []
    for (const fileExport in seederFileExports) {
      const seederExport = seederFileExports[fileExport]
      const instance = new seederExport()
      if (instance instanceof Seeder) {
        seeders.push(seederExport)
      }
    }

    return seeders
  }
}
