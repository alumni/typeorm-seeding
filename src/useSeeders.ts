import { configureConnection, fetchConnection, getConnectionOptions } from './connection'
import { SeederImportationError } from './errors/SeederImportationError'
import { Seeder } from './seeder'
import type { ConnectionConfiguration } from './types'
import { calculateFilePaths } from './utils/fileHandling'

export async function useSeeders(
  executeSeeders?: boolean,
  options?: Partial<ConnectionConfiguration>,
): Promise<Seeder[]>
export async function useSeeders(
  executeSeeders?: boolean,
  seeders?: string[],
  options?: Partial<ConnectionConfiguration>,
): Promise<Seeder[]>

export async function useSeeders(
  executeSeeders?: boolean,
  seedersOrOptions?: string[] | Partial<ConnectionConfiguration>,
  options?: Partial<ConnectionConfiguration>,
) {
  const shouldExecuteSeeders = Boolean(executeSeeders)
  const seeders = Array.isArray(seedersOrOptions) ? seedersOrOptions : undefined
  const customOptions = Array.isArray(seedersOrOptions) ? options : seedersOrOptions

  configureConnection(customOptions)
  const option = await getConnectionOptions()

  let seederFiles = calculateFilePaths(option.seeders)
  if (seeders) {
    const seedersDesired = calculateFilePaths(seeders)
    seederFiles = seederFiles.filter((factoryFile) => seedersDesired.includes(factoryFile))
  }

  let seedersImported: Seeder[]
  try {
    seedersImported = await Promise.all(seederFiles.map((seederFile) => import(seederFile)))
      .then((elementsImported) => elementsImported.flatMap((e) => Object.values(e)))
      .then((elems) => elems.map((elem) => new elem()).filter((elem) => elem instanceof Seeder) as Seeder[])

    if (shouldExecuteSeeders) {
      const connection = await fetchConnection()
      for (const seeder of seedersImported) {
        seeder.run(connection)
      }
    }
  } catch (error: any) {
    throw new SeederImportationError(error.message)
  }

  return seedersImported
}
