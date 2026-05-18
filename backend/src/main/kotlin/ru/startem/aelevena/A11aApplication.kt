package ru.startem.aelevena

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.context.properties.ConfigurationPropertiesScan
import org.springframework.boot.runApplication

@SpringBootApplication
@ConfigurationPropertiesScan
class A11aApplication

fun main(args: Array<String>) {
	//reboot
	runApplication<A11aApplication>(*args)
}
