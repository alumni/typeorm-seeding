import { useDataSource, useSeeders } from "../../src";
import { Pet } from "../fixtures/Pet.entity";
import PetSeeder from "../fixtures/Pet.seeder";
import { User } from "../fixtures/User.entity";
import UserSeeder from "../fixtures/User.seeder";
import { dataSource } from "../fixtures/dataSource";

describe(useSeeders, () => {
	beforeAll(async () => {
		await useDataSource(dataSource, true);
	});

	beforeEach(async () => {
		await dataSource.synchronize(true);
	});

	afterAll(async () => {
		await dataSource.destroy();
	});

	test("Should seed with only one seeder provided", async () => {
		await useSeeders(UserSeeder);

		const em = dataSource.createEntityManager();
		const [totalUsers] = await Promise.all([em.count(User)]);

		expect(totalUsers).toBe(1);
	});

	test("Should seed with multiple seeders provided", async () => {
		await useSeeders([UserSeeder, PetSeeder]);

		const em = dataSource.createEntityManager();
		const [totalUsers, totalPets] = await Promise.all([em.count(User), em.count(Pet)]);

		expect(totalUsers).toBe(2);
		expect(totalPets).toBe(1);
	});
});
